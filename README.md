# MediaPacker

A portable desktop utility for browsing, selecting, and archiving local media files. Scan any folder of images and videos, pick what you want in a Pinterest-style grid, and download a ZIP — all from your browser with zero cloud involvement.

![MediaPacker UI](sample_media/img_1.png)

---

## Features

- **Recursive media scanning** — indexes `.jpg .jpeg .png .webp .gif .mp4 .mov .webm` across all nested subdirectories
- **Pinterest-style masonry grid** — multi-column layout with automatic height balancing across 1–4 columns (responsive)
- **Infinite scroll** — batches of 20 cards rendered on demand via `IntersectionObserver`
- **Video preview on hover** — videos play inline when you mouse over a card; pause on mouse-out
- **Filter by type** — All / Images / Videos tab switcher with live counts
- **Sorting** — sort by filename, file size, or last-modified date (ascending/descending); persisted in `localStorage`
- **Multi-select with visual feedback** — click any card to toggle selection; a glowing ring + checkmark badge confirms it
- **Floating selection footer** — shows selected count, total size estimate, Select All / Clear shortcuts, and the Export button
- **ZIP streaming export** — selected files are packaged server-side and streamed directly to the browser as a download
- **Split-pane media dialog** — right-click any card to open a full-height detail view with image or looping video on the left and metadata + selection controls on the right
- **Click-to-pause video** — click the video in the dialog to toggle play/pause
- **Per-dialog mute button** — a speaker icon in the bottom-right corner of the video panel toggles audio independently or in sync with the global Enable Video Audio toggle
- **Dark / Light theme** — toggle persisted in `localStorage`, applied before first paint to prevent flash
- **Graceful shutdown** — a Quit button in the UI terminates the backend server cleanly via `POST /api/shutdown`
- **Portable single binary** — ships as one self-contained executable; no Python or installer required on the target machine

---

## Project Structure

```
mediapacker/
├── app.py              # FastAPI backend (scan, stream, export, shutdown)
├── app.js              # Frontend application logic (vanilla JS)
├── index.html          # HTML shell — Tailwind CSS + component markup
├── styles.css          # Custom CSS (scrollbar, masonry, animations)
├── requirements.txt    # Runtime Python dependencies
├── requirements-dev.txt  # Build-only dependencies (PyInstaller)
├── MediaPacker.spec    # PyInstaller build spec — edit this for new assets
├── sample_media/       # Test media directory (not committed)
├── build/              # PyInstaller intermediate build artefacts
├── dist/
│   └── MediaPacker     # ✅ Compiled portable binary
└── .venv/              # Python virtual environment (local, not committed)
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  dist/MediaPacker  (single ELF binary, PyInstaller)     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Python runtime + all dependencies (bundled)    │   │
│  │                                                 │   │
│  │  app.py  ──►  FastAPI / Uvicorn                 │   │
│  │               ├── GET  /                 index.html  │
│  │               ├── GET  /app.js           app.js      │
│  │               ├── GET  /styles.css       styles.css  │
│  │               ├── GET  /api/capabilities extensions  │
│  │               ├── POST /api/scan         os.walk     │
│  │               ├── GET  /media/...        StaticFiles │
│  │               ├── POST /api/export       zipfile     │
│  │               └── POST /api/shutdown     os.kill     │
│  └─────────────────────────────────────────────────┘   │
│                          │ HTTP localhost:8000           │
│  ┌───────────────────────▼─────────────────────────┐   │
│  │  Browser (auto-opened on launch)                │   │
│  │  index.html + app.js + styles.css               │   │
│  │  Tailwind CSS (CDN) + Vanilla JS                │   │
│  │  fetch() → /api/scan, /api/export, /api/shutdown│   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key design decisions:**

| Decision | Rationale |
|---|---|
| `DynamicStaticFiles` subclass | Allows re-mounting a new user directory on each scan without restarting the server |
| `sys._MEIPASS` path check | Locates bundled assets (`index.html`, `app.js`, `styles.css`) in PyInstaller's temp extraction folder when frozen |
| `uvicorn.run(app, ...)` when frozen | String-based `"app:app"` module import fails inside a frozen executable; the live object is passed directly |
| Dedicated `GET /app.js` and `GET /styles.css` routes | PyInstaller bundles all three frontend files into `_MEIPASS`; they cannot be served by Starlette's `StaticFiles` directly since the media mount occupies `/media`, so explicit routes are used |
| `stdout`/`stderr` redirect to `devnull` when frozen | Prevents crashes when `--noconsole` is used and the Python runtime has no attached console handles |
| `POST /api/shutdown` with delayed `os.kill` | Lets the HTTP response complete before the process exits, enabling a clean UI shutdown flow from the browser |

---

## Requirements

| Requirement | Version |
|---|---|
| Python | 3.10+ |
| pip | any recent |

No other system dependencies are needed on the target machine. The compiled binary ships with everything.

---

## Development Setup

### 1. Clone / enter the project directory

```bash
cd /path/to/mediapacker
```

### 2. Create and activate a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate   # Linux / macOS
# .venv\Scripts\activate    # Windows
```

### 3. Install runtime dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the development server

```bash
python app.py
```

The server starts on `http://127.0.0.1:8000` and your default browser opens automatically after 1.5 seconds.

> **Tip:** To enable hot-reloading during development, swap the last line in `app.py` to:
> ```python
> uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
> ```
> (This only works outside a frozen binary — do not commit this change before building.)

### 5. Generate test media (optional)

A helper script is included to create a `sample_media/` directory with coloured PNG images and dummy video files across nested subdirectories:

```bash
python3 /path/to/create_mock_media.py
```

Then paste `/path/to/mediapacker/sample_media` into the UI's path input and click **Scan Directory**.

---

## Building the Portable Binary

### Prerequisites

Install the build-only dependencies (separate from runtime):

```bash
pip install -r requirements-dev.txt
```

### Build using the spec file (recommended)

The `MediaPacker.spec` file is checked in to version control and should be used for all builds. It bundles all three required frontend files:

```bash
pyinstaller MediaPacker.spec
```

The spec bundles:

| File | Bundle destination |
|---|---|
| `index.html` | `.` (root of `_MEIPASS`) |
| `app.js` | `.` (root of `_MEIPASS`) |
| `styles.css` | `.` (root of `_MEIPASS`) |

### First-time or spec regeneration

If you need to regenerate the spec from scratch (e.g. after adding new bundled assets), run:

```bash
pyinstaller --onefile --noconsole --name MediaPacker \
  --add-data "index.html:." \
  --add-data "app.js:." \
  --add-data "styles.css:." \
  app.py
```

Then **edit the generated `MediaPacker.spec`** to confirm the `datas` list is correct before committing.

> **Note:** When adding new static assets in the future, update the `datas` list in `MediaPacker.spec` and add a corresponding `GET /<filename>` route in `app.py`.

### Output

The finished binary is written to:

```
dist/MediaPacker        # Linux / macOS
dist/MediaPacker.exe    # Windows (if built on Windows)
```

Build time is ~20–30 seconds. Output size is ~24 MB on Linux.

> **Note:** PyInstaller builds are platform-specific. A binary built on Linux will not run on macOS or Windows. Cross-compilation requires building on each target OS, or using CI/CD.

---

## Installation & Deployment

### End-user installation (Linux / macOS)

No installer required. Simply:

1. Copy `dist/MediaPacker` to any location (e.g. `~/bin/MediaPacker` or `/usr/local/bin/`)
2. Make it executable if needed:
   ```bash
   chmod +x MediaPacker
   ```
3. Run it:
   ```bash
   ./MediaPacker
   ```

Your default browser opens automatically to `http://127.0.0.1:8000`.

To shut it down, click the **Quit** button in the top-right of the UI, or press `Ctrl+C` in the terminal if launched from one.

### Homelab / remote server deployment

Because the server binds to `0.0.0.0`, the UI is accessible from any machine on the same network:

```bash
./MediaPacker --port 9090 --no-browser
```

Then open `http://<server-ip>:9090` in a browser on your client machine.

### Windows

Build on a Windows machine (or in a Windows CI runner) with the same `pyinstaller MediaPacker.spec` command. The output `MediaPacker.exe` is a standalone executable — no install wizard needed.

### Optional: Add to application menu (Linux, `.desktop` file)

```ini
[Desktop Entry]
Type=Application
Name=MediaPacker
Comment=Browse, select, and archive local media files
Exec=/path/to/MediaPacker
Icon=utilities-file-archiver
Categories=Utility;
Terminal=false
```

Save as `~/.local/share/applications/mediapacker.desktop`.

---

## CLI Flags

```
Usage: ./MediaPacker [OPTIONS]

Options:
  -p, --port INTEGER   Port to listen on (default: 8000)
  --no-browser         Don't automatically open a browser tab on startup
  -h, --help           Show this help message and exit
```

### Examples

```bash
# Default — opens browser on http://127.0.0.1:8000
./MediaPacker

# Custom port
./MediaPacker --port 9090
./MediaPacker -p 9090

# Headless server mode — no browser auto-launch
./MediaPacker --port 9090 --no-browser
```

## API Reference

The backend exposes these endpoints. By default they listen on port `8000`; use `--port` to change it.


### `GET /`
Serves `index.html` (the entire frontend shell).

---

### `GET /app.js`
Serves the frontend application logic.

---

### `GET /styles.css`
Serves the custom CSS stylesheet.

---

### `GET /api/capabilities`

Returns the set of supported media extensions and their type classification.

**Response:**
```json
{
  "media_extensions": {
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".webp": "image",
    ".gif": "image",
    ".mp4": "video",
    ".mov": "video",
    ".webm": "video"
  }
}
```

---

### `POST /api/scan`

Recursively scans a directory for media files and mounts it for streaming.

**Request body:**
```json
{ "path": "/absolute/path/to/folder" }
```

**Response:**
```json
{
  "status": "success",
  "directory": "/absolute/path/to/folder",
  "files": [
    {
      "id": "subfolder/photo.jpg",
      "name": "photo.jpg",
      "relative_path": "subfolder/photo.jpg",
      "absolute_path": "/absolute/path/to/folder/subfolder/photo.jpg",
      "type": "image",
      "size": 204800,
      "modified": 1718000000.0
    }
  ]
}
```

Tilde expansion (`~`) and relative paths are resolved to absolute before scanning.

---

### `GET /media/<relative_path>`

Streams a media file from the currently scanned directory. Supports HTTP range requests for video scrubbing. Only accessible after a `/api/scan` call.

---

### `POST /api/export`

Packages selected files into a ZIP archive and streams it as a download.

**Request body:**
```json
{ "files": ["photo.jpg", "subfolder/clip.mp4"] }
```

**Response:** `application/zip` binary stream with header:
```
Content-Disposition: attachment; filename=mediapacker_export.zip
```

All paths are validated against the active scanned directory before packaging (path-traversal protection via `os.path.commonpath`).

---

### `POST /api/shutdown`

Terminates the backend server process after completing the HTTP response. Used by the Quit button in the UI.

**Response:**
```json
{ "status": "success", "message": "Server is shutting down..." }
```

---

## Dependency Notes

| Package | Pinned version | Why pinned |
|---|---|---|
| `fastapi` | `0.111.0` | Stable API surface; ships with Pydantic v2 support |
| `uvicorn` | `0.30.1` | Matches FastAPI's bundled `uvicorn[standard]` requirement |
| `pyinstaller` | `6.8.0` (dev) | Hook contrib `2026.6` supports all indirect deps above |

`pyinstaller` is listed in `requirements-dev.txt` separately so it is not included in the runtime distribution.

To upgrade, test thoroughly before rebuilding — PyInstaller hook compatibility is sensitive to minor version changes in `uvicorn` and `anyio`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Binary exits immediately with no browser | Port 8000 already in use | Use a different port: `./MediaPacker --port 9090`, or kill whatever owns 8000: `lsof -i :8000` |
| `Error loading ASGI app` on binary launch | Old binary built before the frozen-mode fix | Rebuild with current `app.py` |
| `app.js` or `styles.css` returns 404 | Binary built without the updated spec | Rebuild using `pyinstaller MediaPacker.spec` with the current spec |
| Images show as broken in the grid | Directory changed between scan and reload | Re-run Scan Directory |
| Export produces an empty ZIP | Selected paths are outside the scanned directory | Only select files from the current scan |
| Video cards show no thumbnail | Browser can't decode the video codec | `.mov` containers with ProRes or HEVC won't preview in Chrome/Firefox; use `.mp4` H.264 |
| Dialog video has no audio | Global audio is disabled | Enable via the "Enable Video Audio" checkbox in the controls bar, or the speaker button inside the dialog |
