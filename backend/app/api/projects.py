import shutil
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Project, User, ReconstructionJob, MapVersion
from app.schemas import ProjectCreate, ProjectUpdate, ProjectResponse, ReconstructionResponse
from app.api.deps import get_current_user, verify_project_ownership

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.get("", response_model=List[ProjectResponse])
def list_projects(
    status: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List mapping projects for the authenticated surveyor (or all projects if Admin)."""
    effective_status = status or status_filter
    query = db.query(Project)
    if current_user.role != "admin":
        query = query.filter(Project.user_id == current_user.id)
    
    if effective_status:
        query = query.filter(Project.status == effective_status.upper())

    projects = query.order_by(Project.created_at.desc()).all()
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


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    project_in: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Creates a new mapping project owned by the authenticated user."""
    clean_name = project_in.name.strip()
    if not clean_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Project name cannot be empty.")

    project = Project(
        user_id=current_user.id,
        name=clean_name,
        description=project_in.description.strip() if project_in.description else None,
        status="ACTIVE"
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    p_res = ProjectResponse.model_validate(project)
    p_res.owner_email = current_user.email
    p_res.map_versions_count = 0
    return p_res


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve detailed project information with strict ownership check."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    
    verify_project_ownership(project, current_user)

    p_res = ProjectResponse.model_validate(project)
    p_res.owner_email = project.owner.email if project.owner else "Unknown"
    p_res.map_versions_count = db.query(MapVersion).filter(MapVersion.project_id == project.id).count()
    latest_recon = db.query(ReconstructionJob).filter(ReconstructionJob.project_id == project.id).order_by(ReconstructionJob.created_at.desc()).first()
    if latest_recon:
        p_res.latest_reconstruction = ReconstructionResponse.model_validate(latest_recon)
    return p_res


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    project_in: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update project name, description, or status (ACTIVE, ARCHIVED, COMPLETED)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    
    verify_project_ownership(project, current_user)
    
    if project_in.name is not None:
        clean_name = project_in.name.strip()
        if not clean_name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Project name cannot be empty.")
        project.name = clean_name

    if project_in.description is not None:
        project.description = project_in.description.strip() if project_in.description else None
    
    if project_in.status is not None:
        project.status = project_in.status.upper()
    
    db.commit()
    db.refresh(project)

    p_res = ProjectResponse.model_validate(project)
    p_res.owner_email = project.owner.email if project.owner else "Unknown"
    p_res.map_versions_count = db.query(MapVersion).filter(MapVersion.project_id == project.id).count()
    latest_recon = db.query(ReconstructionJob).filter(ReconstructionJob.project_id == project.id).order_by(ReconstructionJob.created_at.desc()).first()
    if latest_recon:
        p_res.latest_reconstruction = ReconstructionResponse.model_validate(latest_recon)
    return p_res


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a mapping project and clean up file artifacts with strict ownership check."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    
    verify_project_ownership(project, current_user)
    
    # Clean up associated local storage folders
    proj_upload_dir = settings.UPLOAD_DIR / project_id
    if proj_upload_dir.exists():
        shutil.rmtree(proj_upload_dir, ignore_errors=True)
    proj_artifact_dir = settings.ARTIFACT_DIR / project_id
    if proj_artifact_dir.exists():
        shutil.rmtree(proj_artifact_dir, ignore_errors=True)

    db.delete(project)
    db.commit()
    return None
