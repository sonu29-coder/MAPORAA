import os
import io
import json
import pytest
import cv2
import numpy as np
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
    """Scenario 1-4: Registration, duplicate detection, valid login, invalid login, me endpoint."""
    # 1. Register Surveyor A
    reg_res = client.post("/api/v1/auth/register", json={
        "email": "user_a@maporaa.io",
        "password": "securepassword123",
        "full_name": "User Alpha"
    })
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == "user_a@maporaa.io"
    assert reg_data["user"]["role"] == "surveyor"

    # 2. Duplicate registration rejected
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
    assert me_res.json()["role"] == "surveyor"

    # 6. Unauthenticated request rejected
    unauth_res = client.get("/api/v1/auth/me")
    assert unauth_res.status_code == 401


def test_auth_deactivated_user():
    """Scenario 5: Inactive / deactivated user access is blocked."""
    # Register surveyor
    reg = client.post("/api/v1/auth/register", json={
        "email": "deactivated@maporaa.io",
        "password": "password123",
        "full_name": "Deactivated User"
    })
    assert reg.status_code == 201

    # Deactivate user directly in DB
    db = TestingSessionLocal()
    u = db.query(User).filter(User.email == "deactivated@maporaa.io").first()
    u.is_active = False
    db.commit()
    db.close()

    # Login attempt should be rejected with 403 Forbidden
    login_res = client.post("/api/v1/auth/login", json={
        "email": "deactivated@maporaa.io",
        "password": "password123"
    })
    assert login_res.status_code == 403
    assert "inactive" in login_res.json()["detail"].lower()


def test_admin_bootstrap_and_rbac():
    """Scenario 6-8: Admin bootstrap, surveyor blocked from admin endpoints, admin access."""
    from app.utils.security import get_password_hash
    db = TestingSessionLocal()
    admin = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
    if not admin:
        admin = User(
            email=settings.ADMIN_EMAIL,
            hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
            full_name=settings.ADMIN_FULL_NAME,
            role="admin",
            is_active=True
        )
        db.add(admin)
        db.commit()
    db.close()

    # Admin Login
    admin_login = client.post("/api/v1/auth/login", json={
        "email": settings.ADMIN_EMAIL,
        "password": settings.ADMIN_PASSWORD
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    assert admin_login.json()["user"]["role"] == "admin"

    # Surveyor Login
    surveyor_login = client.post("/api/v1/auth/login", json={
        "email": "user_a@maporaa.io",
        "password": "securepassword123"
    })
    surveyor_token = surveyor_login.json()["access_token"]

    # Surveyor CANNOT access admin endpoints (403 Forbidden)
    surveyor_admin_res = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {surveyor_token}"})
    assert surveyor_admin_res.status_code == 403

    # Admin CAN access admin endpoints (200 OK)
    admin_users_res = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_users_res.status_code == 200
    assert len(admin_users_res.json()) >= 2

    # Admin can update user status via PATCH /admin/users/{id}
    surveyor_user_id = surveyor_login.json()["user"]["id"]
    patch_user = client.patch(
        f"/api/v1/admin/users/{surveyor_user_id}",
        json={"is_active": True},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert patch_user.status_code == 200
    assert patch_user.json()["is_active"] is True


def test_project_crud_and_surveyor_isolation():
    """Scenario 9-10: Project ownership and strict surveyor isolation."""
    # Register Surveyor Alpha and Surveyor Beta
    res_a = client.post("/api/v1/auth/register", json={
        "email": "surveyor_alpha@maporaa.io",
        "password": "password123"
    })
    token_a = res_a.json()["access_token"]

    res_b = client.post("/api/v1/auth/register", json={
        "email": "surveyor_beta@maporaa.io",
        "password": "password123"
    })
    token_b = res_b.json()["access_token"]

    # Surveyor Alpha creates a project
    create_res = client.post("/api/v1/projects", json={
        "name": "Alpha Tower Walkthrough",
        "description": "Floor 12 Survey"
    }, headers={"Authorization": f"Bearer {token_a}"})
    assert create_res.status_code == 201
    proj_id = create_res.json()["id"]
    assert create_res.json()["status"] == "ACTIVE"

    # Surveyor Alpha can read the project
    get_res = client.get(f"/api/v1/projects/{proj_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Alpha Tower Walkthrough"

    # Surveyor Beta CANNOT read Alpha's project (403 Forbidden)
    unauth_get = client.get(f"/api/v1/projects/{proj_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert unauth_get.status_code == 403

    # Surveyor Beta CANNOT modify Alpha's project (403 Forbidden)
    unauth_patch = client.patch(
        f"/api/v1/projects/{proj_id}",
        json={"name": "Hacked Name"},
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert unauth_patch.status_code == 403

    # Surveyor Beta CANNOT delete Alpha's project (403 Forbidden)
    unauth_del = client.delete(f"/api/v1/projects/{proj_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert unauth_del.status_code == 403

    # Alpha updates own project
    alpha_patch = client.patch(
        f"/api/v1/projects/{proj_id}",
        json={"name": "Alpha Tower Walkthrough (Updated)", "status": "COMPLETED"},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert alpha_patch.status_code == 200
    assert alpha_patch.json()["name"] == "Alpha Tower Walkthrough (Updated)"
    assert alpha_patch.json()["status"] == "COMPLETED"


def test_project_status_filtering_and_admin_management():
    """Scenario 11-12: Lifecycle filtering & Admin platform-wide management."""
    # Login Surveyor Alpha
    login_a = client.post("/api/v1/auth/login", json={
        "email": "surveyor_alpha@maporaa.io",
        "password": "password123"
    })
    token_a = login_a.json()["access_token"]

    # Create an ARCHIVED project
    proj_archived = client.post("/api/v1/projects", json={
        "name": "Archived Project Test"
    }, headers={"Authorization": f"Bearer {token_a}"}).json()
    client.patch(
        f"/api/v1/projects/{proj_archived['id']}",
        json={"status": "ARCHIVED"},
        headers={"Authorization": f"Bearer {token_a}"}
    )

    # Filter projects by status
    res_archived = client.get("/api/v1/projects?status=ARCHIVED", headers={"Authorization": f"Bearer {token_a}"})
    assert res_archived.status_code == 200
    assert all(p["status"] == "ARCHIVED" for p in res_archived.json())

    # Admin Login
    admin_login = client.post("/api/v1/auth/login", json={
        "email": settings.ADMIN_EMAIL,
        "password": settings.ADMIN_PASSWORD
    })
    admin_token = admin_login.json()["access_token"]

    # Admin can view all platform projects
    admin_proj_res = client.get("/api/v1/admin/projects", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_proj_res.status_code == 200
    assert len(admin_proj_res.json()) >= 1

    # Admin can delete any surveyor's project
    admin_del = client.delete(f"/api/v1/admin/projects/{proj_archived['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_del.status_code == 204


def test_video_validation_and_pipeline():
    """Scenario 13: Video validation, OpenCV decoding, and reconstruction pipeline."""
    login_res = client.post("/api/v1/auth/login", json={
        "email": "surveyor_alpha@maporaa.io",
        "password": "password123"
    })
    token = login_res.json()["access_token"]

    proj_res = client.post("/api/v1/projects", json={
        "name": "Pipeline Video Test"
    }, headers={"Authorization": f"Bearer {token}"})
    project_id = proj_res.json()["id"]

    # Reject unsupported video extension
    fake_txt = io.BytesIO(b"not a real video file")
    bad_upload = client.post(
        f"/api/v1/projects/{project_id}/videos",
        files={"file": ("video.txt", fake_txt, "text/plain")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert bad_upload.status_code == 400

    # Create a small valid test video using OpenCV
    temp_video_path = "temp_pipeline_test.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_video_path, fourcc, 10.0, (320, 240))
    for i in range(20):
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


def test_batch_video_upload():
    """Scenario 14: Batch video upload endpoint."""
    login_res = client.post("/api/v1/auth/login", json={
        "email": "surveyor_alpha@maporaa.io",
        "password": "password123"
    })
    token = login_res.json()["access_token"]

    proj_res = client.post("/api/v1/projects", json={
        "name": "Batch Upload Test"
    }, headers={"Authorization": f"Bearer {token}"})
    project_id = proj_res.json()["id"]

    # Generate 2 valid synthetic video files
    v1_path = "batch_vid_1.mp4"
    v2_path = "batch_vid_2.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    
    out1 = cv2.VideoWriter(v1_path, fourcc, 10.0, (160, 120))
    for _ in range(10):
        out1.write(np.zeros((120, 160, 3), dtype=np.uint8))
    out1.release()

    out2 = cv2.VideoWriter(v2_path, fourcc, 10.0, (160, 120))
    for _ in range(10):
        out2.write(np.zeros((120, 160, 3), dtype=np.uint8))
    out2.release()

    with open(v1_path, "rb") as f1, open(v2_path, "rb") as f2:
        batch_res = client.post(
            f"/api/v1/projects/{project_id}/videos/batch",
            files=[
                ("files", ("vid1.mp4", f1, "video/mp4")),
                ("files", ("vid2.mp4", f2, "video/mp4")),
            ],
            headers={"Authorization": f"Bearer {token}"}
        )

    for p in [v1_path, v2_path]:
        if os.path.exists(p):
            os.remove(p)

    assert batch_res.status_code == 201
    batch_data = batch_res.json()
    assert batch_data["total"] == 2
    assert batch_data["succeeded"] == 2
    assert len(batch_data["results"]) == 2
    assert batch_data["results"][0]["success"] is True
    assert batch_data["results"][1]["success"] is True


def test_map_version_history_and_restoration():
    """Scenario 15: Map versioning, revision listing, specific fetch, and historical restoration."""
    login_res = client.post("/api/v1/auth/login", json={
        "email": "surveyor_alpha@maporaa.io",
        "password": "password123"
    })
    token = login_res.json()["access_token"]

    proj_res = client.post("/api/v1/projects", json={
        "name": "Map Versioning Suite"
    }, headers={"Authorization": f"Bearer {token}"})
    project_id = proj_res.json()["id"]

    # 1. Insert Version 1 into DB
    db = TestingSessionLocal()
    m_ver1 = MapVersion(project_id=project_id, version_number=1, revision_name="Initial AI", created_by="AI Pipeline")
    db.add(m_ver1)
    db.flush()

    m_geom1 = MapGeometry(
        map_version_id=m_ver1.id,
        walls=json.dumps([{"id": "w1", "x1": 0.0, "y1": 0.0, "x2": 5.0, "y2": 0.0, "thickness": 0.2, "type": "exterior"}]),
        doors=json.dumps([]),
        rooms=json.dumps([]),
        bounds=json.dumps({"minX": 0, "minY": 0, "maxX": 5, "maxY": 5, "width": 5, "height": 5}),
        is_preliminary=True
    )
    db.add(m_geom1)
    db.commit()
    db.close()

    # 2. Save revision to create Version 2 via PATCH /map
    patch_res = client.patch(f"/api/v1/projects/{project_id}/map", json={
        "revision_name": "Surveyor Wall Modifications",
        "walls": [
            {"id": "w1", "x1": 0.0, "y1": 0.0, "x2": 5.0, "y2": 0.0, "thickness": 0.2, "type": "exterior"},
            {"id": "w2", "x1": 5.0, "y1": 0.0, "x2": 5.0, "y2": 4.0, "thickness": 0.2, "type": "exterior"}
        ],
        "doors": [],
        "rooms": [],
        "is_preliminary": False
    }, headers={"Authorization": f"Bearer {token}"})
    assert patch_res.status_code == 200
    assert patch_res.json()["version_number"] == 2

    # 3. List all versions via GET /projects/{id}/versions
    versions_res = client.get(f"/api/v1/projects/{project_id}/versions", headers={"Authorization": f"Bearer {token}"})
    assert versions_res.status_code == 200
    versions_list = versions_res.json()
    assert len(versions_list) == 2
    assert versions_list[0]["version_number"] == 2
    assert versions_list[1]["version_number"] == 1

    # 4. Fetch specific historical version (Version 1)
    v1_res = client.get(f"/api/v1/projects/{project_id}/versions/1", headers={"Authorization": f"Bearer {token}"})
    assert v1_res.status_code == 200
    assert v1_res.json()["version_number"] == 1
    assert len(v1_res.json()["walls"]) == 1

    # 5. Restore historical Version 1 via POST /projects/{id}/versions/1/restore
    restore_res = client.post(f"/api/v1/projects/{project_id}/versions/1/restore", headers={"Authorization": f"Bearer {token}"})
    assert restore_res.status_code == 200
    restore_data = restore_res.json()
    assert restore_data["version_number"] == 3
    assert restore_data["restored_from_version"] == 1
    assert len(restore_data["walls"]) == 1  # Matches version 1 walls

    # 6. Verify audit retention: Version 1, Version 2, and Version 3 all exist
    all_versions_res = client.get(f"/api/v1/projects/{project_id}/versions", headers={"Authorization": f"Bearer {token}"})
    assert all_versions_res.status_code == 200
    assert len(all_versions_res.json()) == 3


def test_exports_and_cleanup():
    """Test file exports (SVG, PDF, OBJ) and clean deletion."""
    login_res = client.post("/api/v1/auth/login", json={
        "email": "surveyor_alpha@maporaa.io",
        "password": "password123"
    })
    token = login_res.json()["access_token"]

    proj_res = client.post("/api/v1/projects", json={
        "name": "Export Test Suite"
    }, headers={"Authorization": f"Bearer {token}"})
    project_id = proj_res.json()["id"]

    # Add geometry
    client.patch(f"/api/v1/projects/{project_id}/map", json={
        "revision_name": "Export Ready",
        "walls": [{"id": "w1", "x1": 0.0, "y1": 0.0, "x2": 4.0, "y2": 0.0, "thickness": 0.2, "type": "exterior"}],
        "doors": [],
        "rooms": [],
        "is_preliminary": False
    }, headers={"Authorization": f"Bearer {token}"})

    # SVG export
    svg_res = client.post(f"/api/v1/projects/{project_id}/exports", json={"format": "SVG"}, headers={"Authorization": f"Bearer {token}"})
    assert svg_res.status_code == 201
    svg_id = svg_res.json()["id"]
    svg_dl = client.get(f"/api/v1/exports/{svg_id}/download", headers={"Authorization": f"Bearer {token}"})
    assert svg_dl.status_code == 200
    assert b"<svg" in svg_dl.content

    # PDF export
    pdf_res = client.post(f"/api/v1/projects/{project_id}/exports", json={"format": "PDF"}, headers={"Authorization": f"Bearer {token}"})
    assert pdf_res.status_code == 201
    pdf_id = pdf_res.json()["id"]
    pdf_dl = client.get(f"/api/v1/exports/{pdf_id}/download", headers={"Authorization": f"Bearer {token}"})
    assert pdf_dl.status_code == 200
    assert pdf_dl.content.startswith(b"%PDF")

    # OBJ export
    obj_res = client.post(f"/api/v1/projects/{project_id}/exports", json={"format": "OBJ"}, headers={"Authorization": f"Bearer {token}"})
    assert obj_res.status_code == 201
    obj_id = obj_res.json()["id"]
    obj_dl = client.get(f"/api/v1/exports/{obj_id}/download", headers={"Authorization": f"Bearer {token}"})
    assert obj_dl.status_code == 200
    assert len(obj_dl.content) > 0

    # Delete project
    del_res = client.delete(f"/api/v1/projects/{project_id}", headers={"Authorization": f"Bearer {token}"})
    assert del_res.status_code == 204
