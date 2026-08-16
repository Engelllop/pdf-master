# PDF Master

Editor profesional de PDFs inspirado en Bluebeam Revu, UPDF y PDFelement.

## Documentación

- **`DOCUMENTATION.md`** — spec actual (v1.14.0): arquitectura, API, contratos.
- **`CHANGELOG_SESSION.md`** — registro por sesión.
- Tests del backend: `cd backend; .\venv\Scripts\python.exe -m pytest tests -q` (obligatorio tras tocar Python).

> **Regla de producto:** la app **nunca** escribe a disco sin acción explícita del usuario (no hay autoguardado; hay alertas de cambios sin guardar). Ver `DOCUMENTATION.md`.

## Arquitectura

- **Frontend:** Electron + Vite + React + TypeScript + Tailwind CSS
- **Backend:** Python + FastAPI + PyMuPDF (motor de PDFs)
- **Comunicación:** HTTP API local

## Requisitos

- Node.js 18+
- Python 3.10+

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

```powershell
cd frontend
npm run build          # Build frontend assets
npm run build:win      # Crear installer NSIS
```

> El backend ejecutable (`backend/dist/pdf-engine.exe`) debe copiarse a `frontend/resources/backend/pdf-engine.exe` antes de empaquetar.

---

*Memoria y decisiones: este repo (`DOCUMENTATION.md` + `CHANGELOG_SESSION.md`). Canónico: `C:\dev\pdf-master`.*
