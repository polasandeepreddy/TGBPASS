"""
TG-bPASS Data Intelligence Platform - Web Server Launcher
"""

import os
import sys
import subprocess
import webbrowser
import threading
import time
from pathlib import Path

SITE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = SITE_DIR / "frontend"

def check_frontend_built():
    dist_index = FRONTEND_DIR / "dist" / "index.html"
    return dist_index.exists()

def build_frontend():
    print("Building React frontend for production...")
    try:
        # Check node_modules
        if not (FRONTEND_DIR / "node_modules").exists():
            print("Installing frontend npm dependencies...")
            subprocess.run("npm install", cwd=str(FRONTEND_DIR), shell=True, check=True)
        
        subprocess.run("npm run build", cwd=str(FRONTEND_DIR), shell=True, check=True)
        print("Frontend build complete!")
        return True
    except Exception as e:
        print(f"Frontend build error: {e}")
        return False

def free_port(port=8000):
    """Kills any lingering process on the target port to prevent WinError 10048."""
    try:
        if sys.platform == "win32":
            output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode('utf-8', errors='ignore')
            current_pid = os.getpid()
            for line in output.strip().split('\n'):
                parts = line.strip().split()
                if len(parts) >= 5 and 'LISTENING' in parts:
                    pid = parts[-1]
                    if pid.isdigit() and int(pid) != current_pid and int(pid) != 0:
                        print(f"Clearing lingering process on port {port} (PID {pid})...")
                        subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
                        time.sleep(0.5)
    except Exception:
        pass


def open_browser(url, delay=1.5):
    def _open():
        time.sleep(delay)
        print(f"Opening browser at {url}...")
        webbrowser.open(url)
    threading.Thread(target=_open, daemon=True).start()

def run_dev(port=8000, no_browser=False):
    # Ensure dependencies are installed
    if not (FRONTEND_DIR / "node_modules").exists():
        print("Installing frontend dependencies...")
        subprocess.run("npm install", cwd=str(FRONTEND_DIR), shell=True, check=True)

    print("=" * 60)
    print("  Starting Development Mode (Flask API + Vite Dev Server)")
    print(f"  Backend API:  http://localhost:{port}")
    print("  Frontend UI:  http://localhost:3001")
    print("=" * 60)

    # Start Vite dev server as subprocess
    vite_process = subprocess.Popen(
        "npm run dev",
        cwd=str(FRONTEND_DIR),
        shell=True
    )

    if not no_browser:
        open_browser("http://localhost:3001")

    try:
        os.environ['SERVER_PORT'] = str(port)
        from app import app
        app.run(host="0.0.0.0", port=port, debug=False)
    finally:
        print("\nShutting down frontend server...")
        try:
            if sys.platform == "win32":
                subprocess.run(f"taskkill /F /T /PID {vite_process.pid}", shell=True, capture_output=True)
            else:
                vite_process.terminate()
        except Exception:
            pass

def main():
    import argparse
    parser = argparse.ArgumentParser(description="TG-bPASS Web Dashboard Runner")
    parser.add_argument("--port", type=int, default=8000, help="Port to run server on (default: 8000)")
    parser.add_argument("--open-browser", action="store_true", help="Automatically open browser")
    parser.add_argument("--no-browser", action="store_true", default=True, help="Do not automatically open browser")
    parser.add_argument("--dev", action="store_true", help="Run in dev mode (spawns both Flask and Vite dev server)")
    parser.add_argument("--build", action="store_true", help="Force rebuild frontend")
    args = parser.parse_args()

    if args.dev:
        run_dev(port=args.port, no_browser=not args.open_browser)
        return

    # Build frontend if needed
    if args.build or not check_frontend_built():
        build_frontend()

    url = f"http://localhost:{args.port}"
    if args.open_browser:
        open_browser(url)

    # Ensure port is clean
    free_port(args.port)

    # Launch Flask app
    os.environ['SERVER_PORT'] = str(args.port)
    from app import app
    print("=" * 60)
    print(f"  TG-bPASS Data Intelligence Platform is running!")
    print(f"  URL: {url}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=args.port, debug=False, threaded=True)

if __name__ == "__main__":
    main()

