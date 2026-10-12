import json
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Project, MapVersion, MapGeometry, User
from app.schemas import MapGeometryResponse, MapGeometryUpdate, MapVersionSummary
from app.api.deps import get_current_user, verify_project_ownership

router = APIRouter(tags=["Maps"])

@router.get("/projects/{project_id}/map", response_model=MapGeometryResponse)
def get_project_map(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve the current active floor plan geometry for a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    verify_project_ownership(project, current_user)

    latest_ver = db.query(MapVersion).filter(MapVersion.project_id == project_id).order_by(MapVersion.version_number.desc()).first()
    if not latest_ver or not latest_ver.geometry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No reconstructed map found for this project yet. Please complete a reconstruction first."
        )

    geom = latest_ver.geometry
    return MapGeometryResponse(
        id=geom.id,
        map_version_id=latest_ver.id,
        version_number=latest_ver.version_number,
        revision_name=latest_ver.revision_name,
        restored_from_version=latest_ver.restored_from_version,
        created_by=latest_ver.created_by,
        walls=json.loads(geom.walls or "[]"),
        doors=json.loads(geom.doors or "[]"),
        rooms=json.loads(geom.rooms or "[]"),
        nav_graph=json.loads(geom.nav_graph or "{}"),
        bounds=json.loads(geom.bounds or "{}"),
        is_preliminary=geom.is_preliminary,
        uncertainty_notes=geom.uncertainty_notes or "",
        updated_at=geom.updated_at
    )


@router.get("/projects/{project_id}/versions", response_model=List[MapVersionSummary])
def list_map_versions(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve the full revision history of map versions for a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    verify_project_ownership(project, current_user)

    versions = db.query(MapVersion).filter(MapVersion.project_id == project_id).order_by(MapVersion.version_number.desc()).all()
    results = []
    for v in versions:
        walls_list = json.loads(v.geometry.walls or "[]") if v.geometry else []
        doors_list = json.loads(v.geometry.doors or "[]") if v.geometry else []
        rooms_list = json.loads(v.geometry.rooms or "[]") if v.geometry else []
        is_prelim = v.geometry.is_preliminary if v.geometry else True

        results.append(MapVersionSummary(
            id=v.id,
            project_id=v.project_id,
            version_number=v.version_number,
            revision_name=v.revision_name,
            created_by=v.created_by,
            creator_email=v.creator.email if v.creator else None,
            restored_from_version=v.restored_from_version,
            walls_count=len(walls_list),
            doors_count=len(doors_list),
            rooms_count=len(rooms_list),
            is_preliminary=is_prelim,
            created_at=v.created_at
        ))
    return results


@router.get("/projects/{project_id}/versions/{version_number}", response_model=MapGeometryResponse)
def get_specific_map_version(
    project_id: str,
    version_number: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve a specific historical map version's geometry."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    verify_project_ownership(project, current_user)

    target_ver = db.query(MapVersion).filter(
        MapVersion.project_id == project_id,
        MapVersion.version_number == version_number
    ).first()
    if not target_ver or not target_ver.geometry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Map version {version_number} not found for this project."
        )

    geom = target_ver.geometry
    return MapGeometryResponse(
        id=geom.id,
        map_version_id=target_ver.id,
        version_number=target_ver.version_number,
        revision_name=target_ver.revision_name,
        restored_from_version=target_ver.restored_from_version,
        created_by=target_ver.created_by,
        walls=json.loads(geom.walls or "[]"),
        doors=json.loads(geom.doors or "[]"),
        rooms=json.loads(geom.rooms or "[]"),
        nav_graph=json.loads(geom.nav_graph or "{}"),
        bounds=json.loads(geom.bounds or "{}"),
        is_preliminary=geom.is_preliminary,
        uncertainty_notes=geom.uncertainty_notes or "",
        updated_at=geom.updated_at
    )


@router.post("/projects/{project_id}/versions/{version_number}/restore", response_model=MapGeometryResponse)
def restore_earlier_map_version(
    project_id: str,
    version_number: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Restores an earlier map version by creating a new version iteration from it,
    preserving all previous version histories without destroying any audit data.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    verify_project_ownership(project, current_user)

    target_ver = db.query(MapVersion).filter(
        MapVersion.project_id == project_id,
        MapVersion.version_number == version_number
    ).first()
    if not target_ver or not target_ver.geometry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cannot restore: Version {version_number} does not exist."
        )

    latest_ver = db.query(MapVersion).filter(MapVersion.project_id == project_id).order_by(MapVersion.version_number.desc()).first()
    new_version_num = (latest_ver.version_number + 1) if latest_ver else 1

    new_ver = MapVersion(
        project_id=project_id,
        version_number=new_version_num,
        revision_name=f"Restored from v{version_number} ({target_ver.revision_name})",
        created_by=current_user.id,
        restored_from_version=version_number
    )
    db.add(new_ver)
    db.flush()

    source_geom = target_ver.geometry
    new_geom = MapGeometry(
        map_version_id=new_ver.id,
        walls=source_geom.walls,
        doors=source_geom.doors,
        rooms=source_geom.rooms,
        nav_graph=source_geom.nav_graph,
        bounds=source_geom.bounds,
        is_preliminary=False,
        uncertainty_notes=f"Restored from version {version_number}."
    )
    db.add(new_geom)
    db.commit()
    db.refresh(new_geom)

    return MapGeometryResponse(
        id=new_geom.id,
        map_version_id=new_ver.id,
        version_number=new_ver.version_number,
        revision_name=new_ver.revision_name,
        restored_from_version=new_ver.restored_from_version,
        created_by=new_ver.created_by,
        walls=json.loads(new_geom.walls or "[]"),
        doors=json.loads(new_geom.doors or "[]"),
        rooms=json.loads(new_geom.rooms or "[]"),
        nav_graph=json.loads(new_geom.nav_graph or "{}"),
        bounds=json.loads(new_geom.bounds or "{}"),
        is_preliminary=new_geom.is_preliminary,
        uncertainty_notes=new_geom.uncertainty_notes,
        updated_at=new_geom.updated_at
    )


@router.patch("/projects/{project_id}/map", response_model=MapGeometryResponse)
def update_project_map(
    project_id: str,
    map_update: MapGeometryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Saves a new floor plan geometry revision, appending to the version history."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    verify_project_ownership(project, current_user)

    # Validation: ensure walls have valid coordinate numbers
    for w in map_update.walls:
        if not (isinstance(w.x1, (int, float)) and isinstance(w.y1, (int, float)) and
                isinstance(w.x2, (int, float)) and isinstance(w.y2, (int, float))):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Wall {w.id} has invalid coordinates."
            )

    latest_ver = db.query(MapVersion).filter(MapVersion.project_id == project_id).order_by(MapVersion.version_number.desc()).first()
    new_version_num = (latest_ver.version_number + 1) if latest_ver else 1

    new_ver = MapVersion(
        project_id=project_id,
        version_number=new_version_num,
        revision_name=map_update.revision_name or f"User Edit v{new_version_num}",
        created_by=current_user.id
    )
    db.add(new_ver)
    db.flush()

    # Calculate bounding box
    all_x = [w.x1 for w in map_update.walls] + [w.x2 for w in map_update.walls]
    all_y = [w.y1 for w in map_update.walls] + [w.y2 for w in map_update.walls]
    bounds_dict = map_update.bounds or {}
    if all_x and all_y:
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        bounds_dict = {
            "minX": round(min_x, 2),
            "minY": round(min_y, 2),
            "maxX": round(max_x, 2),
            "maxY": round(max_y, 2),
            "width": round(max(1.0, max_x - min_x), 2),
            "height": round(max(1.0, max_y - min_y), 2)
        }

    new_geom = MapGeometry(
        map_version_id=new_ver.id,
        walls=json.dumps([w.model_dump() for w in map_update.walls]),
        doors=json.dumps([d.model_dump() for d in map_update.doors]),
        rooms=json.dumps([r.model_dump() for r in map_update.rooms]),
        nav_graph=json.dumps(map_update.nav_graph.model_dump() if map_update.nav_graph else {}),
        bounds=json.dumps(bounds_dict),
        is_preliminary=map_update.is_preliminary if map_update.is_preliminary is not None else False,
        uncertainty_notes=map_update.uncertainty_notes or "User-edited geometry revision."
    )
    db.add(new_geom)
    db.commit()
    db.refresh(new_geom)

    return MapGeometryResponse(
        id=new_geom.id,
        map_version_id=new_ver.id,
        version_number=new_ver.version_number,
        revision_name=new_ver.revision_name,
        restored_from_version=new_ver.restored_from_version,
        created_by=new_ver.created_by,
        walls=map_update.walls,
        doors=map_update.doors,
        rooms=map_update.rooms,
        nav_graph=map_update.nav_graph or {},
        bounds=bounds_dict,
        is_preliminary=new_geom.is_preliminary,
        uncertainty_notes=new_geom.uncertainty_notes,
        updated_at=new_geom.updated_at
    )


@router.get("/projects/{project_id}/pointcloud")
def get_pointcloud(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    verify_project_ownership(project, current_user)

    ply_path = settings.ARTIFACT_DIR / project_id / "reconstruction.ply"
    if not ply_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Point cloud not generated yet. Complete a reconstruction first."
        )

    return FileResponse(path=ply_path, media_type="text/plain", filename="reconstruction.ply")


@router.get("/projects/{project_id}/model3d")
def get_model3d(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    verify_project_ownership(project, current_user)

    obj_path = settings.ARTIFACT_DIR / project_id / "reconstruction.obj"
    if not obj_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="3D model not found for this project."
        )

    return FileResponse(path=obj_path, media_type="model/obj", filename="reconstruction.obj")
