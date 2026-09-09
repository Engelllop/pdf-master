# PDF Master

Editor profesional de PDFs inspirado en Bluebeam Revu, UPDF y PDFelement.

## Documentación

- **`DOCUMENTATION.md`** — spec actual: arquitectura, API, contratos. La versión que declara la cabecera se valida contra `frontend/package.json` en los tests (`versionSync.test.ts`), que es la fuente única.
- **`CHANGELOG_SESSION.md`** — registro por sesión.
- Tests del backend: `cd backend; .\venv\Scripts\python.exe -m pytest tests -q` (obligatorio tras tocar Python).

> **Regla de producto:** la app **nunca** escribe a disco sin acción explícita del usuario (no hay autoguardado; hay alertas de cambios sin guardar). Ver `DOCUMENTATION.md`.

## Arquitectura

- **Frontend:** Electron + Vite + React + TypeScript + Tailwind CSS
- **Backend:** Python + FastAPI + PyMuPDF (motor de PDFs)
- **Comunicación:** HTTP API local

## Requisitos

- Node.js 20+ (el CI usa 22; Vite 7 ya no arranca con 18)
- Python 3.10+ (el CI y el motor empaquetado usan 3.13)
- Tesseract OCR **aparte**, solo para el OCR: el instalador no lo trae. Sin él, las
  herramientas de OCR avisan y el resto de la app funciona igual.

## Estructura del Proyecto

```
pdf-master/
├── frontend/          # Aplicación Electron
│   ├── src/
│   │   ├── main/      # Proceso main de Electron
│   │   ├── preload/   # Preload script (seguridad)
│   │   └── renderer/  # UI React
│   └── package.json
├── backend/           # API Python
│   ├── app/
│   │   ├── routers/   # Endpoints API
│   │   ├── services/  # Lógica de negocio PDF
│   │   └── models/    # Modelos Pydantic
│   ├── venv/          # Entorno virtual Python
│   └── main.py
└── dev.ps1            # Script de desarrollo
```

## Inicio Rápido

### Windows (PowerShell)

```powershell
# Desde la raíz del proyecto
.\dev.ps1
```

### Manual

```powershell
# Terminal 1 - Backend
cd backend
.\venv\Scripts\python.exe main.py

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## Build

El motor compilado **no está en git** (48 MB por revisión dejaron el repo en 705 MB,
y la copia versionada se quedaba vieja sin que nada lo dijera). Hay que compilarlo
antes de empaquetar:

El motor va empaquetado **onedir** (una carpeta, no un `.exe` suelto): el onefile se
descomprimía entero en `%TEMP%` en cada arranque y eso costaba ~1 s. Se copia el
**contenido** de `dist\pdf-engine\`, no la carpeta.

```powershell
# 1. Motor
cd backend
.\venv\Scripts\python.exe -m PyInstaller pdf-engine.spec --noconfirm --clean
Copy-Item dist\pdf-engine\* ..\frontend\resources\backend\ -Recurse -Force

# 2. Instalador
cd ..\frontend
npm run build:win      # typecheck + build + verificar:motor + NSIS
```

`npm run verificar:motor` (que `build:win` corre solo) exige el exe **y** su
`_internal/`, lo arranca y le pregunta su versión por `/pdf/health`: si falta algo o
no coincide con `package.json`, el build se detiene ahí en vez de producir un
instalador con un motor viejo o a medias.

## Medir en vez de adivinar

```powershell
cd frontend
npm run medir:motor          # motor: lanzamiento -> /pdf/health (--venv para comparar)
npm run medir:arranque       # app real (CON_DOC=0 aísla el primer pintado)
npm run analizar:bundle      # de qué está hecho cada chunk (ANALIZAR_BUNDLE=1 npm run build)
```

---

*Memoria y decisiones: este repo (`DOCUMENTATION.md` + `CHANGELOG_SESSION.md`). Canónico: `C:\dev\pdf-master`.*
