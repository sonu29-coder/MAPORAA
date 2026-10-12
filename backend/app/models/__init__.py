import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(String(32), default="surveyor", nullable=False)  # "surveyor" or "admin"
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(32), default="ACTIVE", nullable=False)  # ACTIVE, ARCHIVED, COMPLETED
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    owner = relationship("User", back_populates="projects")
    videos = relationship("Video", back_populates="project", cascade="all, delete-orphan")
    reconstructions = relationship("ReconstructionJob", back_populates="project", cascade="all, delete-orphan")
    map_versions = relationship("MapVersion", back_populates="project", cascade="all, delete-orphan")
    exports = relationship("ExportRecord", back_populates="project", cascade="all, delete-orphan")


class Video(Base):
    __tablename__ = "videos"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    filepath = Column(String(512), nullable=False)
    file_size = Column(Integer, nullable=False)
    duration = Column(Float, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    fps = Column(Float, nullable=True)
    format = Column(String(32), nullable=True)
    status = Column(String(32), default="READY", nullable=False)  # READY, PROCESSING, FAILED
    storage_type = Column(String(32), default="local", nullable=False)  # local, s3
    created_at = Column(DateTime(timezone=True), default=utc_now)

    project = relationship("Project", back_populates="videos")
    reconstructions = relationship("ReconstructionJob", back_populates="video", cascade="all, delete-orphan")


class ReconstructionJob(Base):
    __tablename__ = "reconstruction_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    video_id = Column(String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(32), default="PENDING", index=True)  # PENDING, RUNNING, COMPLETED, FAILED
    current_stage = Column(Integer, default=1)
    progress = Column(Float, default=0.0)
    error_message = Column(Text, nullable=True)
    practical_feedback = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    project = relationship("Project", back_populates="reconstructions")
    video = relationship("Video", back_populates="reconstructions")
    stages = relationship("ProcessingStage", back_populates="job", cascade="all, delete-orphan", order_by="ProcessingStage.stage_number")


class ProcessingStage(Base):
    __tablename__ = "processing_stages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    job_id = Column(String(36), ForeignKey("reconstruction_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    stage_number = Column(Integer, nullable=False)
    stage_name = Column(String(128), nullable=False)
    status = Column(String(32), default="PENDING")  # PENDING, RUNNING, COMPLETED, FAILED
    progress = Column(Float, default=0.0)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    job = relationship("ReconstructionJob", back_populates="stages")


class MapVersion(Base):
    __tablename__ = "map_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, default=1)
    revision_name = Column(String(128), default="Initial Reconstruction")
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    restored_from_version = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    project = relationship("Project", back_populates="map_versions")
    creator = relationship("User", foreign_keys=[created_by])
    geometry = relationship("MapGeometry", back_populates="map_version", uselist=False, cascade="all, delete-orphan")


class MapGeometry(Base):
    __tablename__ = "map_geometries"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    map_version_id = Column(String(36), ForeignKey("map_versions.id", ondelete="CASCADE"), nullable=False, unique=True)
    walls = Column(Text, default="[]")       # JSON array of walls: [{id, x1, y1, x2, y2, thickness, type}]
    doors = Column(Text, default="[]")       # JSON array of doors: [{id, x, y, width, rotation, label}]
    rooms = Column(Text, default="[]")       # JSON array of rooms: [{id, name, polygon: [[x,y]...], color}]
    nav_graph = Column(Text, default="{}")   # JSON object: {nodes: [{id, x, y}], edges: [[id1, id2]]}
    bounds = Column(Text, default="{}")      # JSON object: {minX, minY, maxX, maxY, width, height}
    is_preliminary = Column(Boolean, default=True)
    uncertainty_notes = Column(Text, default="Preliminary estimate: monocular depth estimation does not yield metric scale ground truth.")
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    map_version = relationship("MapVersion", back_populates="geometry")


class ExportRecord(Base):
    __tablename__ = "export_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    format = Column(String(32), nullable=False)  # SVG, PDF, OBJ, GLTF, JSON
    filename = Column(String(255), nullable=False)
    filepath = Column(String(512), nullable=False)
    file_size = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    project = relationship("Project", back_populates="exports")
