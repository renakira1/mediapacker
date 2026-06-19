# -*- mode: python ; coding: utf-8 -*-
# MediaPacker PyInstaller build spec.
# This file is version-controlled. Run `pyinstaller MediaPacker.spec` to build.
# When adding new static frontend assets, add them to the `datas` list below
# and add a corresponding GET route in app.py.


a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=[('index.html', '.'), ('app.js', '.'), ('styles.css', '.')],
    hiddenimports=[
        # anyio dynamically imports its backend via importlib — PyInstaller
        # cannot detect these automatically, so they must be listed explicitly.
        'anyio._backends._asyncio',
        'anyio._backends._trio',
        # uvicorn / starlette internals also loaded dynamically
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='MediaPacker',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
