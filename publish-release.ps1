#requires -Version 5.1
<#
  Script para publicar PDF Master en GitHub.
  Paso 1: Crear un Personal Access Token en:
    https://github.com/settings/tokens/new
  Scopes necesarios: repo (marcar todo el grupo)
  Paso 2: Ejecutar este script y pegar el token cuando lo pida.
#>

$ErrorActionPreference = 'Stop'

# --- CONFIGURACIÓN ---
$Owner = 'Engelllop'
$Repo  = 'pdf-master'
$Tag   = 'v1.1.1'
$DistDir = 'frontend\dist'
$SetupFile = 'PDF-Master-Setup-1.1.1.exe'
$LatestYml = 'latest.yml'

# --- PEDIR TOKEN ---
Write-Host "`n=== Publicar PDF Master a GitHub ===" -ForegroundColor Cyan
Write-Host "1. Andá a https://github.com/settings/tokens/new" -ForegroundColor Yellow
Write-Host "2. Marcá el scope 'repo' (todo el grupo)" -ForegroundColor Yellow
Write-Host "3. Generá el token y copialo." -ForegroundColor Yellow
$Token = Read-Host -Prompt "`nPegá tu GitHub Personal Access Token"
if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Error "Token vacío. Abortando."
    exit 1
}

# --- VERIFICAR TOKEN ---
Write-Host "`nVerificando token..." -NoNewline
$Headers = @{
    Authorization = "token $Token"
    Accept = 'application/vnd.github.v3+json'
}
try {
    $User = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $Headers -Method GET
    Write-Host " OK ($($User.login))" -ForegroundColor Green
} catch {
    Write-Error "Token inválido o sin permisos. Error: $($_.Exception.Message)"
    exit 1
}

# --- CREAR REPO SI NO EXISTE ---
Write-Host "Verificando repo $Owner/$Repo..." -NoNewline
try {
    $RepoInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo" -Headers $Headers -Method GET
    Write-Host " ya existe." -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host " no existe. Creando..." -NoNewline
        $Body = @{ name = $Repo; private = $false; auto_init = $false } | ConvertTo-Json
        Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $Headers -Method POST -Body $Body -ContentType 'application/json' | Out-Null
        Write-Host " creado." -ForegroundColor Green
        Start-Sleep -Seconds 2
    } else {
        throw
    }
}

# --- PUSH DEL CÓDIGO ---
Write-Host "`nConfigurando remote y haciendo push..."
cd $PSScriptRoot

$null = git remote remove origin 2>&1
$null = git remote add origin "https://$Token@github.com/$Owner/$Repo.git" 2>&1

try {
    git branch -M main
    git push -u origin main
    Write-Host "Push completado." -ForegroundColor Green
} catch {
    Write-Error "Error haciendo push: $($_.Exception.Message)"
    exit 1
}

# --- CREAR RELEASE ---
Write-Host "`nCreando release $Tag..." -NoNewline
$ReleaseBody = @{
    tag_name = $Tag
    name = "PDF Master $Tag"
    body = "Auto-updater habilitado. Incluye modo comparación, mediciones, corrección de ventana invisible y NSIS en español."
    draft = $false
    prerelease = $false
} | ConvertTo-Json

try {
    $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/releases" -Headers $Headers -Method POST -Body $ReleaseBody -ContentType 'application/json'
    Write-Host " creada." -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 422) {
        Write-Host " ya existe. Buscando ID..." -NoNewline
        $Releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/releases" -Headers $Headers -Method GET
        $Release = $Releases | Where-Object { $_.tag_name -eq $Tag } | Select-Object -First 1
        Write-Host " OK." -ForegroundColor Green
    } else {
        throw
    }
}

$UploadUrl = $Release.upload_url -replace '\{\?name,label\}', ''

# --- SUBIR ARCHIVOS ---
function Upload-Asset($FilePath, $Name) {
    Write-Host "Subiendo $Name..." -NoNewline
    $FileBytes = [System.IO.File]::ReadAllBytes($FilePath)
    $Uri = "$UploadUrl?name=$Name"
    $AssetHeaders = @{
        Authorization = "token $Token"
        Accept = 'application/vnd.github.v3+json'
        'Content-Type' = 'application/octet-stream'
    }
    Invoke-RestMethod -Uri $Uri -Headers $AssetHeaders -Method POST -Body $FileBytes | Out-Null
    Write-Host " OK." -ForegroundColor Green
}

$SetupPath = Join-Path $PSScriptRoot $DistDir $SetupFile
$LatestPath = Join-Path $PSScriptRoot $DistDir $LatestYml

if (Test-Path $SetupPath) {
    Upload-Asset $SetupPath $SetupFile
} else {
    Write-Warning "No se encontró $SetupPath"
}

if (Test-Path $LatestPath) {
    Upload-Asset $LatestPath $LatestYml
} else {
    Write-Warning "No se encontró $LatestPath"
}

# --- LIMPIAR ---
$null = git remote remove origin 2>&1
$null = git remote add origin "https://github.com/$Owner/$Repo.git" 2>&1

Write-Host "`n=== LISTO ===" -ForegroundColor Cyan
Write-Host "Release publicada: $($Release.html_url)" -ForegroundColor Green
Write-Host "La próxima vez que abras PDF Master, va a detectar esta versión automáticamente." -ForegroundColor Green
