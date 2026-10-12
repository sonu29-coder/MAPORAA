# MAPORAA &bull; AI-Based Indoor Map Generation from a Single Camera

**MAPORAA** is a full-stack web application designed to convert indoor video walkthroughs recorded on standard single-camera mobile devices into preliminary 2D floor plans and 3D architectural representations.

---

## Architecture Overview

```
MAPORAA
├── frontend/               # React 18, TypeScript, Vite, Material UI, Three.js
│   ├── src/
│   │   ├── components/     # Navbar, ProtectedRoute, UI widgets
│   │   ├── context/        # AuthContext (JWT session state)
│   │   ├── pages/          # Home, Login, Register, Dashboard, Wizard, Processing, 2D Map, 3D View, Export
│   │   ├── services/       # Axios API client with bearer token interceptor
│   │   └── theme.ts        # Brand palette (Navy #14243A, Teal #16B8A6, Background #F5F7FA)
├── backend/                # Python, FastAPI, SQLAlchemy, OpenCV, ReportLab
│   ├── app/
│   │   ├── api/            # Endpoints: auth, projects, videos, reconstructions, maps, exports
│   │   ├── models/         # SQLAlchemy DB models (User, Project, Video, Job, Stage, Map, Export)
│   │   ├── schemas/        # Pydantic v2 validation models
│   │   ├── pipeline/       # 10-stage Computer Vision & geometric extraction engine
│   │   └── utils/          # Security (bcrypt, JWT), ReportLab PDF generator, SVG floor plan builder
│   ├── tests/              # Pytest suite testing auth, ownership, video validation, revisions & exports
│   └── run.py              # Server launcher
├── docker-compose.yml      # Optional containerized stack with PostgreSQL
└── .env.example            # Environment variables template
```

---

## 10-Stage Computer Vision Pipeline

1. **Video Validation:** Verifies stream readability, dimensions, duration, and frame decodability via OpenCV (`cv2.VideoCapture`).
2. **Frame Extraction:** Subsamples walking frames and filters motion blur using Laplacian variance thresholding.
3. **Keyframe Selection:** Filters sharpest and visually distinctive frames across the walkthrough path.
4. **Camera-Pose Estimation:** Matches sequential ORB feature descriptors and estimates relative camera trajectory $(X, Y, Z)$.
5. **Monocular Depth Estimation:** Approximates relative depth gradients across viewpoint keyframes.
6. **Point-Cloud Generation:** Unprojects 2D features into 3D coordinates and writes standard ASCII `.ply` point cloud files.
7. **Preliminary Floor-Plan Extraction:** Projects 3D points onto the horizontal plane, segmenting orthogonal wall line candidates.
8. **Room and Doorway Inference:** Detects boundary enclosures and door openings.
9. **Navigation Graph Generation:** Connects room centroids and doorways into topological waypoints.
10. **Artifact Generation:** Generates genuine SVG vector floor plans, ReportLab PDF reports, and OBJ 3D models.

> **Important Monocular Depth Note:** Monocular camera depth estimation is inherently uncalibrated in absolute metric scale without reference markers. MAPORAA clearly marks preliminary reconstructions and provides an interactive 2D editor to adjust dimensions.

---

## Prerequisites

* **Node.js** (v18+) and **npm**
* **Python** (3.11 or 3.14)
* **PostgreSQL** (optional, defaults to SQLite out of the box)

---

## Quickstart Guide

### 1. Backend Setup

```bash
cd backend

# Option A: Run using your installed Python
python run.py

# Option B: Run via uvicorn directly
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at:
* API Root: `http://localhost:8000`
* Swagger Interactive Docs: `http://localhost:8000/docs`
* ReDoc Specification: `http://localhost:8000/redoc`

### 2. Frontend Setup

In a new terminal window:

```bash
cd frontend

# Start Vite development server
npm run dev
```

The application interface will open at:
`http://localhost:5173`

---

## Running Automated Tests

To run the complete test suite verifying authentication, ownership security, OpenCV video validation, 10-stage job tracking, map revisions, and genuine PDF/SVG/OBJ exports:

```bash
cd backend
python -m pytest tests/test_api.py -v
```

---

## Available Exports

From `/projects/:projectId/export`, users can generate and download genuine architectural files:

* **SVG Floor Plan (`.svg`):** Scalable vector drawing of all walls, doors, and rooms.
* **PDF Architectural Report (`.pdf`):** Multi-page ReportLab document with floor plan drawing, room breakdown table, metadata, and limitations notice.
* **OBJ 3D Model (`.obj`):** 3D Wavefront mesh with extruded walls (2.6m height) and floor plane.
* **JSON Layout (`.json`):** Machine-readable coordinate schema.
