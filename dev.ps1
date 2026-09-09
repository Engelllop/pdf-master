# PDF Master - Script de desarrollo
# Inicia el backend Python y el frontend Electron

$backendPath = Join-Path $PSScriptRoot "backend"
$frontendPath = Join-Path $PSScriptRoot "frontend"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDF Master - Modo Desarrollo" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Iniciar Backend Python
Write-Host "[1/2] Iniciando Backend Python (FastAPI + PyMuPDF)..." -ForegroundColor Green
$backendJob = Start-Job -ScriptBlock {
    param($path)
    Set-Location $path
    & .\venv\Scripts\python.exe main.py
} -ArgumentList $backendPath

Start-Sleep -Seconds 2

# Verificar que el backend está corriendo. Se pregunta a /pdf/health, que existe justo
# para esto: antes se mandaba un POST /pdf/open vacío esperando un 422, o sea que la
# sonda dependía de que fallara la validación de otro endpoint.
$backendReady = $false
$version = $null
for ($i = 0; $i -lt 15; $i++) {
    try {
        $salud = Invoke-RestMethod -Uri "http://localhost:8745/pdf/health" -TimeoutSec 2 -ErrorAction Stop
        if ($salud.status -eq 'ok') {
            $backendReady = $true
            $version = $salud.version
            break
        }
    } catch {
        # todavía no escucha
    }
    Start-Sleep -Seconds 1
}

if ($backendReady) {
    Write-Host "      Motor $version listo en http://localhost:8745" -ForegroundColor DarkGreen
} else {
    Write-Host "      Advertencia: el motor no contesto /pdf/health en 15s" -ForegroundColor Yellow
    Write-Host "      Mira si el 8745 lo tiene otro pdf-engine (la app instalada abierta)." -ForegroundColor Yellow
}

Write-Host ""

# Iniciar Frontend Electron
Write-Host "[2/2] Iniciando Frontend Electron..." -ForegroundColor Green
Set-Location $frontendPath
& npm run dev

# Al cerrar, detener el backend
Write-Host ""
Write-Host "Cerrando backend..." -ForegroundColor Yellow
Stop-Job $backendJob
Remove-Job $backendJob
