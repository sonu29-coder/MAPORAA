from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def init_db_schema():
    Base.metadata.create_all(bind=engine)
    if settings.DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            try:
                # users table
                u_cols = [c[1] for c in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()]
                if "role" not in u_cols:
                    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN role VARCHAR(32) DEFAULT 'surveyor'")
                if "is_active" not in u_cols:
                    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1")

                # projects table
                p_cols = [c[1] for c in conn.exec_driver_sql("PRAGMA table_info(projects)").fetchall()]
                if "status" not in p_cols:
                    conn.exec_driver_sql("ALTER TABLE projects ADD COLUMN status VARCHAR(32) DEFAULT 'ACTIVE'")

                # videos table
                v_cols = [c[1] for c in conn.exec_driver_sql("PRAGMA table_info(videos)").fetchall()]
                if "status" not in v_cols:
                    conn.exec_driver_sql("ALTER TABLE videos ADD COLUMN status VARCHAR(32) DEFAULT 'READY'")
                if "storage_type" not in v_cols:
                    conn.exec_driver_sql("ALTER TABLE videos ADD COLUMN storage_type VARCHAR(32) DEFAULT 'local'")

                # map_versions table
                mv_cols = [c[1] for c in conn.exec_driver_sql("PRAGMA table_info(map_versions)").fetchall()]
                if "created_by" not in mv_cols:
                    conn.exec_driver_sql("ALTER TABLE map_versions ADD COLUMN created_by VARCHAR(36)")
                if "restored_from_version" not in mv_cols:
                    conn.exec_driver_sql("ALTER TABLE map_versions ADD COLUMN restored_from_version INTEGER")

                conn.commit()
            except Exception:
                pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
