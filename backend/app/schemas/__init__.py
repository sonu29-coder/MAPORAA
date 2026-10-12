from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

EMAIL_REGEX = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'

# --- Auth Schemas ---
class UserCreate(BaseModel):
    email: str = Field(..., pattern=EMAIL_REGEX)
    password: str = Field(..., min_length=6)
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    email: str = Field(..., pattern=EMAIL_REGEX)
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TokenData(BaseModel):
    user_id: Optional[str] = None


# --- Project Schemas ---
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None

class VideoResponse(BaseModel):
    id: str
    project_id: str
    filename: str
    file_size: int
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    format: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ProcessingStageResponse(BaseModel):
    id: str
    stage_number: int
    stage_name: str
    status: str
    progress: float
    details: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ReconstructionResponse(BaseModel):
    id: str
    project_id: str
    video_id: str
    status: str
    current_stage: int
    progress: float
    error_message: Optional[str] = None
    practical_feedback: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    stages: List[ProcessingStageResponse] = []
    model_config = ConfigDict(from_attributes=True)

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    videos: List[VideoResponse] = []
    latest_reconstruction: Optional[ReconstructionResponse] = None
    model_config = ConfigDict(from_attributes=True)


# --- Map Geometry Schemas ---
class WallItem(BaseModel):
    id: str
    x1: float
    y1: float
    x2: float
    y2: float
    thickness: float = 0.2
    type: str = "exterior"  # exterior, interior, divider

class DoorItem(BaseModel):
    id: str
    x: float
    y: float
    width: float = 0.9
    rotation: float = 0.0
    label: Optional[str] = "Door"

class RoomItem(BaseModel):
    id: str
    name: str
    polygon: List[List[float]]  # list of [x, y] points
    color: Optional[str] = "#16B8A6"

class NavGraphItem(BaseModel):
    nodes: List[Dict[str, Any]] = []
    edges: List[List[str]] = []

class MapGeometryResponse(BaseModel):
    id: str
    map_version_id: str
    version_number: int = 1
    revision_name: str = "Initial Reconstruction"
    walls: List[WallItem] = []
    doors: List[DoorItem] = []
    rooms: List[RoomItem] = []
    nav_graph: NavGraphItem = NavGraphItem()
    bounds: Dict[str, Any] = {}
    is_preliminary: bool = True
    uncertainty_notes: str = ""
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class MapGeometryUpdate(BaseModel):
    revision_name: Optional[str] = "Manual Edit"
    walls: List[WallItem]
    doors: List[DoorItem]
    rooms: List[RoomItem]
    nav_graph: Optional[NavGraphItem] = None
    bounds: Optional[Dict[str, Any]] = None
    is_preliminary: Optional[bool] = False
    uncertainty_notes: Optional[str] = None


# --- Export Schemas ---
class ExportRequest(BaseModel):
    format: str  # SVG, PDF, OBJ, GLTF, JSON

class ExportResponse(BaseModel):
    id: str
    project_id: str
    format: str
    filename: str
    file_size: int
    created_at: datetime
    download_url: str
    model_config = ConfigDict(from_attributes=True)
