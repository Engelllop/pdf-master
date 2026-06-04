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

# Verificar que el backend está corriendo
$backendReady = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8745/pdf/open" -Method POST -Body '{"file_path":""}' -ContentType "application/json" -ErrorAction Stop -TimeoutSec 2
        if ($response.StatusCode -eq 422) {
            $backendReady = $true
            break
        }
    } catch {
        # 422 significa que el endpoint existe pero faltan datos, eso está bien
        if ($_.Exception.Response.StatusCode.value__ -eq 422) {
            $backendReady = $true
            break
        }
    }
    Start-Sleep -Seconds 1
}

if ($backendReady) {
    Write-Host "      Backend listo en http://localhost:8745" -ForegroundColor DarkGreen
} else {
    Write-Host "      Advertencia: El backend puede no estar listo aún" -ForegroundColor Yellow
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
