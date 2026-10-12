import os
import sys
import subprocess
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"

def ensure_frontend_built():
    """Builds the frontend production bundle if not already compiled."""
    index_html = FRONTEND_DIST / "index.html"
    if not index_html.exists():
        print("[MAPORAA] Frontend build not found. Compiling production bundle with npm run build...")
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        try:
            subprocess.run([npm_cmd, "run", "build"], cwd=FRONTEND_DIR, check=True)
            print("[MAPORAA] Frontend bundle compiled successfully!")
        except Exception as e:
            print(f"[MAPORAA] Warning: Could not compile frontend automatically: {e}")

def main():
    ensure_frontend_built()

    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    
    os.chdir(BACKEND_DIR)

    import uvicorn
    print("\n" + "=" * 65)
    print("  MAPORAA: AI-Based Indoor Map Generation Platform")
    print("=" * 65)
    print("  * Fullstack Web App:     http://localhost:8000")
    print("  * Interactive API Docs:  http://localhost:8000/docs")
    print("  * Health Check API:      http://localhost:8000/api/v1/health")
    print("=" * 65 + "\n")

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

if __name__ == "__main__":
    main()
