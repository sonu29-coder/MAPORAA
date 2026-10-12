import os
import shutil
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Project, Video, User
from app.schemas import VideoResponse
from app.api.deps import get_current_user
from app.pipeline.video_validator import validate_video_file

router = APIRouter(tags=["Videos"])

@router.post("/projects/{project_id}/videos", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{ext}'. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )

    # Save to disk in chunks with size limit enforcement
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    total_written = 0
    chunk_size = 1024 * 1024  # 1 MB chunk

    video_id = str(uuid.uuid4())
    clean_filename = f"{video_id}_{file.filename}"
    project_upload_dir = settings.UPLOAD_DIR / project_id
    project_upload_dir.mkdir(parents=True, exist_ok=True)
    destination_path = project_upload_dir / clean_filename

    try:
        with open(destination_path, "wb") as buffer:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total_written += len(chunk)
                if total_written > max_bytes:
                    if destination_path.exists():
                        destination_path.unlink()
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Video file exceeds maximum allowed limit of {settings.MAX_UPLOAD_SIZE_MB} MB."
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if destination_path.exists():
            destination_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write video file to storage: {str(e)}"
        )
    finally:
        await file.close()

    # Server-side validation with OpenCV
    is_valid, error_msg, metadata = validate_video_file(destination_path)
    if not is_valid:
        if destination_path.exists():
            destination_path.unlink()  # remove invalid file
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Video validation failed: {error_msg}"
        )

    # Check for duplicate video submission within the project
    existing_video = db.query(Video).filter(
        Video.project_id == project_id,
        Video.filename == file.filename,
        Video.file_size == metadata.get("file_size", 0)
    ).first()
    if existing_video:
        # Avoid creating duplicate records for the exact same file
        if destination_path.exists() and str(destination_path) != existing_video.filepath:
            destination_path.unlink()
        return VideoResponse.model_validate(existing_video)

    video_record = Video(
        id=video_id,
        project_id=project_id,
        filename=file.filename,
        filepath=str(destination_path),
        file_size=metadata.get("file_size", 0),
        duration=metadata.get("duration"),
        width=metadata.get("width"),
        height=metadata.get("height"),
        fps=metadata.get("fps"),
        format=metadata.get("format")
    )
    db.add(video_record)
    db.commit()
    db.refresh(video_record)

    return VideoResponse.model_validate(video_record)


@router.get("/videos/{video_id}", response_model=VideoResponse)
def get_video_info(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    
    # Check ownership
    project = db.query(Project).filter(Project.id == video.project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    
    return VideoResponse.model_validate(video)


@router.get("/videos/{video_id}/stream")
def stream_video(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    
    project = db.query(Project).filter(Project.id == video.project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    video_path = Path(video.filepath)
    if not video_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video file missing from storage.")

    media_type = f"video/{video_path.suffix.replace('.', '')}"
    return FileResponse(path=video_path, media_type=media_type, filename=video.filename)
