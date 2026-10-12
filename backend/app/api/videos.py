import os
import shutil
import uuid
from pathlib import Path
from typing import List, Tuple, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Project, Video, User
from app.schemas import VideoResponse, BatchVideoUploadResponse, BatchVideoItemResult
from app.api.deps import get_current_user, verify_project_ownership
from app.pipeline.video_validator import validate_video_file

router = APIRouter(tags=["Videos"])


async def process_single_video_file(
    file: UploadFile,
    project_id: str,
    db: Session
) -> Tuple[bool, Optional[Video], Optional[str]]:
    """
    Streams a single video file to storage in chunks, enforces size limits,
    executes server-side validation, and persists the Video record.
    Returns (success, video_record, error_message).
    """
    raw_name = Path(file.filename or "video.mp4").name  # Sanitize against path traversal
    ext = Path(raw_name).suffix.lower()

    if ext not in settings.ALLOWED_EXTENSIONS:
        return False, None, f"Unsupported format '{ext}'. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"

    video_id = str(uuid.uuid4())
    stored_filename = f"{video_id}_{raw_name}"
    project_upload_dir = (settings.UPLOAD_DIR / project_id).resolve()
    project_upload_dir.mkdir(parents=True, exist_ok=True)
    destination_path = (project_upload_dir / stored_filename).resolve()

    # Safety check: prevent directory traversal outside project upload dir
    if not str(destination_path).startswith(str(project_upload_dir)):
        return False, None, "Invalid file destination path."

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    total_written = 0
    chunk_size = 1024 * 1024  # 1 MB chunk streaming to avoid memory exhaustion

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
                    return False, None, f"Exceeds maximum allowed limit of {settings.MAX_UPLOAD_SIZE_MB} MB."
                buffer.write(chunk)
    except Exception as e:
        if destination_path.exists():
            destination_path.unlink()
        return False, None, f"Storage write error: {str(e)}"
    finally:
        await file.close()

    # Server-side validation with OpenCV
    is_valid, error_msg, metadata = validate_video_file(destination_path)
    if not is_valid:
        if destination_path.exists():
            destination_path.unlink()
        return False, None, f"Video validation failed: {error_msg}"

    # Check for duplicate video submission within the same project
    existing_video = db.query(Video).filter(
        Video.project_id == project_id,
        Video.filename == raw_name,
        Video.file_size == metadata.get("file_size", 0)
    ).first()
    if existing_video:
        if destination_path.exists() and str(destination_path) != existing_video.filepath:
            destination_path.unlink()
        return True, existing_video, None

    # Persist in database
    video_record = Video(
        id=video_id,
        project_id=project_id,
        filename=raw_name,
        filepath=str(destination_path),
        file_size=metadata.get("file_size", 0),
        duration=metadata.get("duration"),
        width=metadata.get("width"),
        height=metadata.get("height"),
        fps=metadata.get("fps"),
        format=metadata.get("format"),
        status="READY",
        storage_type="local"
    )
    db.add(video_record)
    db.commit()
    db.refresh(video_record)

    return True, video_record, None


@router.post("/projects/{project_id}/videos", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def upload_single_video(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload a single walkthrough video with size limits and OpenCV verification."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    verify_project_ownership(project, current_user)

    success, video_record, error_msg = await process_single_video_file(file, project_id, db)
    if not success:
        if "Exceeds maximum" in (error_msg or ""):
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=error_msg)
        if "Unsupported format" in (error_msg or ""):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error_msg)

    return VideoResponse.model_validate(video_record)


@router.post("/projects/{project_id}/videos/batch", response_model=BatchVideoUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_batch_videos(
    project_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Batch upload multiple walkthrough videos for a mapping project.
    Validates each file independently and returns individual statuses.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    verify_project_ownership(project, current_user)

    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No video files selected for batch upload.")

    results: List[BatchVideoItemResult] = []
    succeeded = 0
    failed = 0

    for f in files:
        fname = Path(f.filename or "video").name
        success, video_record, err = await process_single_video_file(f, project_id, db)
        if success and video_record:
            succeeded += 1
            results.append(BatchVideoItemResult(
                filename=fname,
                success=True,
                video=VideoResponse.model_validate(video_record),
                error=None
            ))
        else:
            failed += 1
            results.append(BatchVideoItemResult(
                filename=fname,
                success=False,
                video=None,
                error=err or "Upload failed"
            ))

    return BatchVideoUploadResponse(
        total=len(files),
        succeeded=succeeded,
        failed=failed,
        results=results
    )


@router.get("/videos/{video_id}", response_model=VideoResponse)
def get_video_info(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve metadata for a video record without exposing internal disk paths."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    
    project = db.query(Project).filter(Project.id == video.project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found.")
    
    verify_project_ownership(project, current_user)
    return VideoResponse.model_validate(video)


@router.get("/videos/{video_id}/stream")
def stream_video(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Stream authorized video content with strict project ownership enforcement."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    
    project = db.query(Project).filter(Project.id == video.project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found.")

    verify_project_ownership(project, current_user)

    video_path = Path(video.filepath)
    if not video_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video file missing from storage.")

    media_type = f"video/{video_path.suffix.replace('.', '')}"
    return FileResponse(path=video_path, media_type=media_type, filename=video.filename)
