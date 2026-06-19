import os
import sys
import time
import argparse
import pathlib
import zipfile
import tempfile
import threading
import webbrowser
from typing import List
import signal
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

# Handle PyInstaller windowed output redirection to prevent crashes on print/log
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

app = FastAPI(title="MediaPacker Backend")

# Enable CORS for local testing if needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve path for packaged assets
if getattr(sys, 'frozen', False):
    base_path = sys._MEIPASS
else:
    base_path = os.path.dirname(os.path.abspath(__file__))

index_html_path = os.path.join(base_path, "index.html")

# Custom dynamic static file server class
class DynamicStaticFiles(StaticFiles):
    def __init__(self, **kwargs):
        super().__init__(check_dir=False, **kwargs)
        self.active_dir = None

    def set_directory(self, directory: str):
        self.active_dir = directory
        self.directory = directory
        self.all_directories = [pathlib.Path(directory)]

    async def __call__(self, scope, receive, send):
        if not self.active_dir:
            from starlette.responses import Response
            response = Response("No media directory scanned yet", status_code=400)
            await response(scope, receive, send)
            return
        await super().__call__(scope, receive, send)

# Instantiate and mount the dynamic media static server
media_static = DynamicStaticFiles()
app.mount("/media", media_static, name="media")

class ScanRequest(BaseModel):
    path: str

class ExportRequest(BaseModel):
    files: List[str]

@app.get("/")
def read_root():
    if not os.path.exists(index_html_path):
        raise HTTPException(status_code=404, detail="Frontend index.html not found.")
    return FileResponse(index_html_path)

@app.get("/app.js")
def get_app_js():
    js_path = os.path.join(base_path, "app.js")
    if not os.path.exists(js_path):
        raise HTTPException(status_code=404, detail="Frontend app.js not found.")
    return FileResponse(js_path)

@app.get("/styles.css")
def get_styles_css():
    css_path = os.path.join(base_path, "styles.css")
    if not os.path.exists(css_path):
        raise HTTPException(status_code=404, detail="Frontend styles.css not found.")
    return FileResponse(css_path)

MEDIA_EXTENSIONS = {
    # Images
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', 
    '.webp': 'image', '.gif': 'image',
    # Videos
    '.mp4': 'video', '.mov': 'video', '.webm': 'video'
}

@app.get("/api/capabilities")
def get_capabilities():
    return {
        "media_extensions": MEDIA_EXTENSIONS
    }

@app.get("/api/browse")
def browse_directory(path: str = ""):
    """Return subdirectories at the given path for filesystem navigation."""
    if not path:
        # Default to home directory
        path = os.path.expanduser("~")
    
    path = os.path.abspath(os.path.expanduser(path.strip()))
    
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail=f"Path '{path}' does not exist.")
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail=f"Path '{path}' is not a directory.")
    
    # Compute parent path (stop at filesystem root)
    parent = str(pathlib.Path(path).parent)
    if parent == path:
        parent = None  # We are already at the root
    
    # List subdirectories only, sorted alphabetically (case-insensitive)
    try:
        entries = []
        with os.scandir(path) as it:
            for entry in it:
                if entry.is_dir(follow_symlinks=False) and not entry.name.startswith('.'):
                    entries.append(entry.name)
        entries.sort(key=lambda n: n.lower())
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied reading '{path}'.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading directory: {str(e)}")
    
    return {
        "path": path,
        "parent": parent,
        "directories": entries
    }

@app.post("/api/scan")
def scan_directory(request: ScanRequest):
    target_path = request.path.strip()
    if not target_path:
        raise HTTPException(status_code=400, detail="Path cannot be empty.")
    
    # Expand user directory (e.g. ~)
    target_path = os.path.abspath(os.path.expanduser(target_path))
    
    if not os.path.exists(target_path):
        raise HTTPException(status_code=400, detail=f"Path '{target_path}' does not exist.")
    if not os.path.isdir(target_path):
        raise HTTPException(status_code=400, detail=f"Path '{target_path}' is not a directory.")

    media_files = []


    try:
        for root, _, files in os.walk(target_path):
            for file in files:
                _, ext = os.path.splitext(file)
                ext = ext.lower()
                if ext in MEDIA_EXTENSIONS:
                    abs_filepath = os.path.join(root, file)
                    rel_filepath = os.path.relpath(abs_filepath, target_path)
                    media_files.append({
                        "id": rel_filepath,
                        "name": file,
                        "relative_path": rel_filepath,
                        "absolute_path": abs_filepath,
                        "type": MEDIA_EXTENSIONS[ext],
                        "size": os.path.getsize(abs_filepath),
                        "modified": os.path.getmtime(abs_filepath)
                    })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error scanning directory: {str(e)}")

    # Update active directory for media streaming
    try:
        media_static.set_directory(target_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mount media directory: {str(e)}")

    return {
        "status": "success",
        "directory": target_path,
        "files": media_files
    }

@app.post("/api/export")
def export_files(request: ExportRequest):
    if not media_static.active_dir:
        raise HTTPException(status_code=400, detail="No active media directory. Scan a directory first.")
    
    if not request.files:
        raise HTTPException(status_code=400, detail="No files selected for export.")

    active_dir = os.path.abspath(media_static.active_dir)

    # Create a temporary file for the ZIP archive
    try:
        temp_fd, temp_path = tempfile.mkstemp(suffix=".zip")
        os.close(temp_fd)  # Close the file descriptor so zipfile can write to it safely
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create temporary export file: {str(e)}")

    try:
        with zipfile.ZipFile(temp_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for rel_path in request.files:
                # Sanitize / construct absolute path
                abs_path = os.path.abspath(os.path.join(active_dir, rel_path))
                
                # Security check: Ensure the file is strictly inside the active directory
                try:
                    common = os.path.commonpath([active_dir, abs_path])
                    if common != active_dir:
                        continue
                except ValueError:
                    # Raised if paths are on different drives (Windows) or invalid
                    continue
                
                if os.path.exists(abs_path) and os.path.isfile(abs_path):
                    # Write to ZIP using relative path structure
                    zip_file.write(abs_path, arcname=rel_path)
    except Exception as e:
        # Clean up temporary file on failure
        try:
            os.remove(temp_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to package ZIP file: {str(e)}")

    # Generator to stream the file chunks and clean up the temp file on complete
    def file_iterator(file_path: str, chunk_size: int = 8192):
        try:
            with open(file_path, "rb") as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
        finally:
            try:
                os.remove(file_path)
            except Exception:
                pass

    return StreamingResponse(
        file_iterator(temp_path),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=mediapacker_export.zip"}
    )

@app.post("/api/shutdown")
def shutdown_server(background_tasks: BackgroundTasks):
    def self_destruct():
        time.sleep(0.5)
        os.kill(os.getpid(), signal.SIGINT)
    background_tasks.add_task(self_destruct)
    return {"status": "success", "message": "Server is shutting down..."}

def open_browser(port: int):
    time.sleep(1.5)
    try:
        webbrowser.open(f"http://127.0.0.1:{port}")
    except Exception:
        pass

if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="MediaPacker – media scanning and packaging server")
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=8000,
        help="Port to listen on (default: 8000)"
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Don't automatically open a browser tab on startup"
    )
    args = parser.parse_args()

    if not args.no_browser:
        threading.Thread(target=open_browser, args=(args.port,), daemon=True).start()

    # When frozen by PyInstaller, pass the app object directly.
    # uvicorn.run("app:app", ...) fails in frozen mode because the "app"
    # module cannot be imported by name from inside the bundled executable.
    if getattr(sys, 'frozen', False):
        uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="error")
    else:
        uvicorn.run("app:app", host="0.0.0.0", port=args.port, log_level="info")
