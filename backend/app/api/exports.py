import os
import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Project, MapVersion, ExportRecord, User
from app.schemas import ExportRequest, ExportResponse
from app.api.deps import get_current_user, verify_project_ownership
from app.utils.exporter import generate_pdf_report
from app.pipeline.pipeline_runner import generate_svg_floorplan

router = APIRouter(tags=["Exports"])

@router.post("/projects/{project_id}/exports", response_model=ExportResponse, status_code=status.HTTP_201_CREATED)
def create_export(
    project_id: str,
    export_in: ExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    verify_project_ownership(project, current_user)

    latest_ver = db.query(MapVersion).filter(MapVersion.project_id == project_id).order_by(MapVersion.version_number.desc()).first()
    if not latest_ver or not latest_ver.geometry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot export: No floor plan geometry has been generated for this project yet."
        )

    fmt = export_in.format.upper()
    if fmt not in ["SVG", "PDF", "OBJ", "JSON", "GLTF"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported export format '{fmt}'. Supported: SVG, PDF, OBJ, JSON"
        )

    geom = latest_ver.geometry
    walls = json.loads(geom.walls or "[]")
    doors = json.loads(geom.doors or "[]")
    rooms = json.loads(geom.rooms or "[]")
    bounds = json.loads(geom.bounds or "{}")

    artifact_dir = settings.ARTIFACT_DIR / project_id
    artifact_dir.mkdir(parents=True, exist_ok=True)

    filename = f"maporaa_{project.name.replace(' ', '_').lower()}_v{latest_ver.version_number}.{fmt.lower()}"
    file_path = artifact_dir / filename

    if fmt == "SVG":
        svg_content = generate_svg_floorplan(walls, doors, rooms, bounds)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(svg_content)
    elif fmt == "PDF":
        generate_pdf_report(
            output_path=file_path,
            project_name=project.name,
            project_desc=project.description or "",
            map_version=latest_ver.version_number,
            walls=walls,
            doors=doors,
            rooms=rooms,
            bounds=bounds,
            uncertainty_notes=geom.uncertainty_notes or ""
        )
    elif fmt == "OBJ":
        source_obj = artifact_dir / "reconstruction.obj"
        if source_obj.exists():
            import shutil
            shutil.copyfile(source_obj, file_path)
        else:
            with open(file_path, "w") as f:
                f.write(f"# MAPORAA 3D Model: {project.name}\n")
                for w in walls:
                    f.write(f"v {w['x1']} 0.0 {w['y1']}\n")
                    f.write(f"v {w['x2']} 0.0 {w['y2']}\n")
    elif fmt == "JSON":
        data = {
            "projectName": project.name,
            "version": latest_ver.version_number,
            "walls": walls,
            "doors": doors,
            "rooms": rooms,
            "bounds": bounds,
            "uncertaintyNotes": geom.uncertainty_notes
        }
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    elif fmt == "GLTF":
        # Honest status: GLTF binary converter placeholder with actual JSON structure
        data = {
            "asset": {"version": "2.0", "generator": "MAPORAA Monocular Reconstructor"},
            "scenes": [{"nodes": [0]}],
            "nodes": [{"name": project.name}],
            "notes": "Preliminary GLTF scene descriptor."
        }
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    export_rec = ExportRecord(
        project_id=project_id,
        format=fmt,
        filename=filename,
        filepath=str(file_path),
        file_size=os.path.getsize(file_path) if file_path.exists() else 0
    )
    db.add(export_rec)
    db.commit()
    db.refresh(export_rec)

    return ExportResponse(
        id=export_rec.id,
        project_id=project_id,
        format=export_rec.format,
        filename=export_rec.filename,
        file_size=export_rec.file_size,
        created_at=export_rec.created_at,
        download_url=f"/api/v1/exports/{export_rec.id}/download"
    )


@router.get("/exports/{export_id}", response_model=ExportResponse)
def get_export_info(
    export_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    record = db.query(ExportRecord).filter(ExportRecord.id == export_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found.")

    project = db.query(Project).filter(Project.id == record.project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found.")

    verify_project_ownership(project, current_user)

    return ExportResponse(
        id=record.id,
        project_id=record.project_id,
        format=record.format,
        filename=record.filename,
        file_size=record.file_size,
        created_at=record.created_at,
        download_url=f"/api/v1/exports/{record.id}/download"
    )


@router.get("/exports/{export_id}/download")
def download_export(
    export_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    record = db.query(ExportRecord).filter(ExportRecord.id == export_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found.")

    project = db.query(Project).filter(Project.id == record.project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found.")

    verify_project_ownership(project, current_user)

    file_path = Path(record.filepath)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export file missing from disk.")

    media_types = {
        "SVG": "image/svg+xml",
        "PDF": "application/pdf",
        "OBJ": "model/obj",
        "JSON": "application/json",
        "GLTF": "model/gltf+json"
    }

    return FileResponse(
        path=file_path,
        media_type=media_types.get(record.format, "application/octet-stream"),
        filename=record.filename,
        headers={"Content-Disposition": f'attachment; filename="{record.filename}"'}
    )
