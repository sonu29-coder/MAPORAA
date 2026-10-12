import os
import io
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import User, Project, Video, MapVersion, MapGeometry

# Use in-memory SQLite with StaticPool so all connections share the same memory instance
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def test_auth_registration_and_login():
    # 1. Register User A
    reg_res = client.post("/api/v1/auth/register", json={
        "email": "user_a@maporaa.io",
        "password": "securepassword123",
        "full_name": "User Alpha"
    })
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == "user_a@maporaa.io"

    # 2. Duplicate registration should be rejected
    dup_res = client.post("/api/v1/auth/register", json={
        "email": "user_a@maporaa.io",
        "password": "anotherpassword"
    })
    assert dup_res.status_code == 400

    # 3. Login with correct credentials
    login_res = client.post("/api/v1/auth/login", json={
        "email": "user_a@maporaa.io",
        "password": "securepassword123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    # 4. Login with incorrect password
    bad_login = client.post("/api/v1/auth/login", json={
        "email": "user_a@maporaa.io",
        "password": "wrongpassword"
    })
    assert bad_login.status_code == 401

    # 5. Protected route /auth/me
    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "user_a@maporaa.io"

    # 6. Protected route without token
    unauth_res = client.get("/api/v1/auth/me")
    assert unauth_res.status_code == 401


def test_project_crud_and_ownership():
    # Register User A and User B
    res_a = client.post("/api/v1/auth/register", json={
        "email": "owner@maporaa.io",
        "password": "password123"
    })
    token_a = res_a.json()["access_token"]

    res_b = client.post("/api/v1/auth/register", json={
        "email": "other@maporaa.io",
        "password": "password123"
    })
    token_b = res_b.json()["access_token"]

    # User A creates a project
    create_res = client.post("/api/v1/projects", json={
        "name": "Loft Apartment Walkthrough",
        "description": "Captured in the morning with natural light"
    }, headers={"Authorization": f"Bearer {token_a}"})
    assert create_res.status_code == 201
    proj_id = create_res.json()["id"]

    # User A can get the project
    get_res = client.get(f"/api/v1/projects/{proj_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Loft Apartment Walkthrough"

    # User B CANNOT get User A's project (Ownership enforcement)
    unauth_proj = client.get(f"/api/v1/projects/{proj_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert unauth_proj.status_code == 404

    # User A lists projects
    list_res = client.get("/api/v1/projects", headers={"Authorization": f"Bearer {token_a}"})
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1


def test_video_validation_and_pipeline():
    # Authenticate User
    login_res = client.post("/api/v1/auth/login", json={
        "email": "owner@maporaa.io",
        "password": "password123"
    })
    token = login_res.json()["access_token"]

    # Create project
    proj_res = client.post("/api/v1/projects", json={
        "name": "Office Floor Plan",
        "description": "Conference hall walkthrough"
    }, headers={"Authorization": f"Bearer {token}"})
    project_id = proj_res.json()["id"]

    # Reject unsupported video extension
    fake_txt = io.BytesIO(b"fake video content")
    bad_upload = client.post(
        f"/api/v1/projects/{project_id}/videos",
        files={"file": ("video.txt", fake_txt, "text/plain")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert bad_upload.status_code == 400

    # Create a small valid test video using OpenCV
    import cv2
    import numpy as np

    temp_video_path = "temp_test_walkthrough.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_video_path, fourcc, 10.0, (320, 240))
    for i in range(25):  # 2.5 seconds video
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        cv2.circle(frame, (160 + i * 2, 120), 20, (255, 255, 255), -1)
        out.write(frame)
    out.release()

    with open(temp_video_path, "rb") as vf:
        upload_res = client.post(
            f"/api/v1/projects/{project_id}/videos",
            files={"file": ("walkthrough.mp4", vf, "video/mp4")},
            headers={"Authorization": f"Bearer {token}"}
        )
    if os.path.exists(temp_video_path):
        os.remove(temp_video_path)

    assert upload_res.status_code == 201
    vid_data = upload_res.json()
    assert vid_data["filename"] == "walkthrough.mp4"
    assert vid_data["width"] == 320
    assert vid_data["height"] == 240

    # Start reconstruction
    recon_res = client.post(
        f"/api/v1/projects/{project_id}/reconstructions",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert recon_res.status_code == 201
    recon_id = recon_res.json()["id"]
    assert len(recon_res.json()["stages"]) == 10

    # Poll reconstruction status
    status_res = client.get(
        f"/api/v1/reconstructions/{recon_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert status_res.status_code == 200
    assert status_res.json()["id"] == recon_id


def test_map_geometry_revision_and_exports():
    # Authenticate
    login_res = client.post("/api/v1/auth/login", json={
        "email": "owner@maporaa.io",
        "password": "password123"
    })
    token = login_res.json()["access_token"]

    # Create project
    proj_res = client.post("/api/v1/projects", json={
        "name": "Suite 404",
        "description": "Studio"
    }, headers={"Authorization": f"Bearer {token}"})
    project_id = proj_res.json()["id"]

    # Directly create initial MapVersion in test DB
    db = TestingSessionLocal()
    m_ver = MapVersion(project_id=project_id, version_number=1, revision_name="Initial AI")
    db.add(m_ver)
    db.flush()

    m_geom = MapGeometry(
        map_version_id=m_ver.id,
        walls=json.dumps([{"id": "w1", "x1": 0.0, "y1": 0.0, "x2": 6.0, "y2": 0.0, "thickness": 0.25, "type": "exterior"}]),
        doors=json.dumps([{"id": "d1", "x": 3.0, "y": 0.0, "width": 0.9, "rotation": 0.0, "label": "Door 1"}]),
        rooms=json.dumps([{"id": "r1", "name": "Studio", "polygon": [[0,0],[6,0],[6,5],[0,5]], "color": "#16B8A6"}]),
        bounds=json.dumps({"minX": 0, "minY": 0, "maxX": 6, "maxY": 5, "width": 6, "height": 5}),
        is_preliminary=True
    )
    db.add(m_geom)
    db.commit()
    db.close()

    # Get map
    get_map = client.get(f"/api/v1/projects/{project_id}/map", headers={"Authorization": f"Bearer {token}"})
    assert get_map.status_code == 200
    assert len(get_map.json()["walls"]) == 1

    # PATCH map geometry to save a new revision
    patch_res = client.patch(f"/api/v1/projects/{project_id}/map", json={
        "revision_name": "User Adjusted Walls",
        "walls": [
            {"id": "w1", "x1": 0.0, "y1": 0.0, "x2": 6.0, "y2": 0.0, "thickness": 0.25, "type": "exterior"},
            {"id": "w2", "x1": 6.0, "y1": 0.0, "x2": 6.0, "y2": 5.0, "thickness": 0.25, "type": "exterior"}
        ],
        "doors": [{"id": "d1", "x": 3.0, "y": 0.0, "width": 0.9, "rotation": 0.0, "label": "Main Entrance"}],
        "rooms": [{"id": "r1", "name": "Primary Suite", "polygon": [[0,0],[6,0],[6,5],[0,5]], "color": "#16B8A6"}],
        "is_preliminary": False
    }, headers={"Authorization": f"Bearer {token}"})

    assert patch_res.status_code == 200
    assert patch_res.json()["version_number"] == 2
    assert len(patch_res.json()["walls"]) == 2

    # Test Exports: SVG
    svg_export = client.post(f"/api/v1/projects/{project_id}/exports", json={"format": "SVG"}, headers={"Authorization": f"Bearer {token}"})
    assert svg_export.status_code == 201
    svg_id = svg_export.json()["id"]

    svg_dl = client.get(f"/api/v1/exports/{svg_id}/download", headers={"Authorization": f"Bearer {token}"})
    assert svg_dl.status_code == 200
    assert b"<svg" in svg_dl.content

    # Test Exports: PDF
    pdf_export = client.post(f"/api/v1/projects/{project_id}/exports", json={"format": "PDF"}, headers={"Authorization": f"Bearer {token}"})
    assert pdf_export.status_code == 201
    pdf_id = pdf_export.json()["id"]

    pdf_dl = client.get(f"/api/v1/exports/{pdf_id}/download", headers={"Authorization": f"Bearer {token}"})
    assert pdf_dl.status_code == 200
    assert pdf_dl.content.startswith(b"%PDF")

    # Test Exports: OBJ
    obj_export = client.post(f"/api/v1/projects/{project_id}/exports", json={"format": "OBJ"}, headers={"Authorization": f"Bearer {token}"})
    assert obj_export.status_code == 201
    obj_id = obj_export.json()["id"]

    obj_dl = client.get(f"/api/v1/exports/{obj_id}/download", headers={"Authorization": f"Bearer {token}"})
    assert obj_dl.status_code == 200
    assert len(obj_dl.content) > 0

    # Delete project
    del_res = client.delete(f"/api/v1/projects/{project_id}", headers={"Authorization": f"Bearer {token}"})
    assert del_res.status_code == 204
