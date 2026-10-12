import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Project, MapVersion, MapGeometry, User
from app.schemas import MapGeometryResponse, MapGeometryUpdate
from app.api.deps import get_current_user

router = APIRouter(tags=["Maps"])

@router.get("/projects/{project_id}/map", response_model=MapGeometryResponse)
def get_project_map(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

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
        walls=json.loads(geom.walls or "[]"),
        doors=json.loads(geom.doors or "[]"),
        rooms=json.loads(geom.rooms or "[]"),
        nav_graph=json.loads(geom.nav_graph or "{}"),
        bounds=json.loads(geom.bounds or "{}"),
        is_preliminary=geom.is_preliminary,
        uncertainty_notes=geom.uncertainty_notes or "",
        updated_at=geom.updated_at
    )


@router.patch("/projects/{project_id}/map", response_model=MapGeometryResponse)
def update_project_map(
    project_id: str,
    map_update: MapGeometryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    # Validation: ensure walls have valid coordinate numbers
    for w in map_update.walls:
        if not (isinstance(w.x1, (int, float)) and isinstance(w.y1, (int, float)) and
                isinstance(w.x2, (int, float)) and isinstance(w.y2, (int, float))):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Wall {w.id} has invalid coordinates."
            )

    # Preserve revisions: Create new MapVersion
    latest_ver = db.query(MapVersion).filter(MapVersion.project_id == project_id).order_by(MapVersion.version_number.desc()).first()
    new_version_num = (latest_ver.version_number + 1) if latest_ver else 1

    new_ver = MapVersion(
        project_id=project_id,
        version_number=new_version_num,
        revision_name=map_update.revision_name or f"User Edit v{new_version_num}"
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
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

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
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    obj_path = settings.ARTIFACT_DIR / project_id / "reconstruction.obj"
    if not obj_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="3D model not found for this project."
        )

    return FileResponse(path=obj_path, media_type="model/obj", filename="reconstruction.obj")
