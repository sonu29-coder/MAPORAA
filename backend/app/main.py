from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import settings
from app.database import engine, Base
from app.api import auth, projects, videos, reconstructions, maps, exports

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="MAPORAA: AI-Based Indoor Map Generation from a Single Camera Walkthrough Video",
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows frontend dev server and network clients
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 routes
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(projects.router, prefix=settings.API_V1_PREFIX)
app.include_router(videos.router, prefix=settings.API_V1_PREFIX)
app.include_router(reconstructions.router, prefix=settings.API_V1_PREFIX)
app.include_router(maps.router, prefix=settings.API_V1_PREFIX)
app.include_router(exports.router, prefix=settings.API_V1_PREFIX)

@app.get("/api/v1/health")
def health_check():
    return {"status": "ok", "service": "MAPORAA API v1"}

# Mount frontend compiled static assets if available
if settings.FRONTEND_DIST.exists():
    assets_dir = settings.FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

@app.get("/")
def serve_root():
    index_file = settings.FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "docs": "/docs",
        "message": "Frontend build not detected. Please run 'npm run build' inside the frontend directory."
    }

@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    # Exclude API endpoints and OpenAPI docs from SPA fallback
    if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("redoc") or full_path == "openapi.json":
        raise HTTPException(status_code=404, detail="Not Found")

    # Serve specific static files if they exist in dist root (e.g. favicon.svg, icons.svg)
    candidate_file = settings.FRONTEND_DIST / full_path
    if candidate_file.is_file():
        return FileResponse(candidate_file)

    # Return index.html for Single-Page Application (SPA) client-side routes (e.g. /dashboard, /login)
    index_file = settings.FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(index_file)

    raise HTTPException(status_code=404, detail="Resource not found")
