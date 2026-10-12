import shutil
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User, Project, Video, MapVersion, ReconstructionJob
from app.schemas import UserAdminView, UserAdminUpdate, ProjectResponse, VideoResponse, ReconstructionResponse
from app.api.deps import require_admin

router = APIRouter(prefix="/admin", tags=["Admin Management"])

@router.get("/users", response_model=List[UserAdminView])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Admin-only: Retrieve all registered users with role and project counts."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    results = []
    for u in users:
        count = db.query(Project).filter(Project.user_id == u.id).count()
        view = UserAdminView(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            project_count=count
        )
        results.append(view)
    return results


@router.patch("/users/{user_id}", response_model=UserAdminView)
def update_user_status_or_role(
    user_id: str,
    update_in: UserAdminUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Admin-only: Update a user's role (admin/surveyor) or activate/deactivate account."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found.")

    # Prevent admin from deactivating or demoting themselves
    if target_user.id == admin.id:
        if update_in.is_active is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate your own administrator account.")
        if update_in.role and update_in.role != "admin":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove administrator privileges from your own account.")

    if update_in.role is not None:
        target_user.role = update_in.role
    if update_in.is_active is not None:
        target_user.is_active = update_in.is_active
    if update_in.full_name is not None:
        target_user.full_name = update_in.full_name

    db.commit()
    db.refresh(target_user)

    count = db.query(Project).filter(Project.user_id == target_user.id).count()
    return UserAdminView(
        id=target_user.id,
        email=target_user.email,
        full_name=target_user.full_name,
        role=target_user.role,
        is_active=target_user.is_active,
        created_at=target_user.created_at,
        project_count=count
    )


@router.get("/projects", response_model=List[ProjectResponse])
def admin_list_all_projects(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Admin-only: View all mapping projects created by any surveyor."""
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    results = []
    for p in projects:
        p_res = ProjectResponse.model_validate(p)
        p_res.owner_email = p.owner.email if p.owner else "Unknown"
        p_res.map_versions_count = db.query(MapVersion).filter(MapVersion.project_id == p.id).count()
        latest_recon = db.query(ReconstructionJob).filter(ReconstructionJob.project_id == p.id).order_by(ReconstructionJob.created_at.desc()).first()
        if latest_recon:
            p_res.latest_reconstruction = ReconstructionResponse.model_validate(latest_recon)
        results.append(p_res)
    return results


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Admin-only: Administratively delete any project and clean up file artifacts."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    # Remove storage folders safely
    proj_upload_dir = settings.UPLOAD_DIR / project_id
    if proj_upload_dir.exists():
        shutil.rmtree(proj_upload_dir, ignore_errors=True)
    proj_artifact_dir = settings.ARTIFACT_DIR / project_id
    if proj_artifact_dir.exists():
        shutil.rmtree(proj_artifact_dir, ignore_errors=True)

    db.delete(project)
    db.commit()
    return None
