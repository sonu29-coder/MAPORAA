import threading
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import Project, Video, ReconstructionJob, ProcessingStage, User
from app.schemas import ReconstructionResponse
from app.api.deps import get_current_user
from app.pipeline.pipeline_runner import run_pipeline, STAGE_DEFINITIONS

router = APIRouter(tags=["Reconstructions"])

@router.post("/projects/{project_id}/reconstructions", response_model=ReconstructionResponse, status_code=status.HTTP_201_CREATED)
def start_reconstruction(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    latest_video = db.query(Video).filter(Video.project_id == project_id).order_by(Video.created_at.desc()).first()
    if not latest_video:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No video uploaded for this project yet. Please upload a walkthrough video first."
        )

    # Create job
    job = ReconstructionJob(
        project_id=project_id,
        video_id=latest_video.id,
        status="PENDING",
        current_stage=1,
        progress=0.0
    )
    db.add(job)
    db.flush()

    # Initialize 10 processing stages in DB
    for num, name in STAGE_DEFINITIONS:
        stage = ProcessingStage(
            job_id=job.id,
            stage_number=num,
            stage_name=name,
            status="PENDING",
            progress=0.0
        )
        db.add(stage)

    db.commit()
    db.refresh(job)

    # Launch processing pipeline asynchronously
    thread = threading.Thread(target=run_pipeline, args=(job.id, SessionLocal), daemon=True)
    thread.start()

    return ReconstructionResponse.model_validate(job)


@router.get("/reconstructions/{reconstruction_id}", response_model=ReconstructionResponse)
def get_reconstruction_status(
    reconstruction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(ReconstructionJob).filter(ReconstructionJob.id == reconstruction_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reconstruction job not found.")

    # Authorization
    project = db.query(Project).filter(Project.id == job.project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    return ReconstructionResponse.model_validate(job)


@router.post("/reconstructions/{reconstruction_id}/retry", response_model=ReconstructionResponse)
def retry_reconstruction(
    reconstruction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(ReconstructionJob).filter(ReconstructionJob.id == reconstruction_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reconstruction job not found.")

    project = db.query(Project).filter(Project.id == job.project_id, Project.user_id == current_user.id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    # Reset stages
    for stage in job.stages:
        stage.status = "PENDING"
        stage.progress = 0.0
        stage.details = None

    job.status = "PENDING"
    job.progress = 0.0
    job.error_message = None
    job.practical_feedback = None
    db.commit()
    db.refresh(job)

    thread = threading.Thread(target=run_pipeline, args=(job.id, SessionLocal), daemon=True)
    thread.start()

    return ReconstructionResponse.model_validate(job)
