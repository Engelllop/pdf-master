# -*- mode: python ; coding: utf-8 -*-

# `upx=False` y no True como estaba. El True era decorativo: UPX no esta instalado en
# esta maquina ni en el runner, asi que PyInstaller lo saltaba en silencio (el build
# pesa lo mismo con y sin). Y en onedir tampoco interesa activarlo: comprime cada DLL
# y Windows la descomprime AL CARGARLA, o sea en cada arranque del motor, para ahorrar
# disco que el instalador NSIS ya comprime por su cuenta.


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('app', 'app')],
    hiddenimports=['fitz', 'pytesseract', 'PIL', 'PIL.Image', 'openpyxl', 'docx', 'pptx'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

# onedir, no onefile. El onefile se descomprimia entero en %TEMP% en CADA arranque
# (47 MB), y eso costaba ~1 s de los 1,75 s que tardaba el motor en contestar
# /pdf/health: es el rato que el usuario espera antes de ver la primera pagina. En
# onedir no hay nada que descomprimir, las DLL se cargan del disco tal cual.
#
# `exclude_binaries=True` + COLLECT es lo que reparte el contenido: queda
# dist/pdf-engine/ con el exe y su _internal/. Al empaquetar se copia el CONTENIDO de
# esa carpeta a resources/backend, asi que el motor sigue estando en
# resources/backend/pdf-engine.exe y el main de Electron no cambia.
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='pdf-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='pdf-engine',
)
