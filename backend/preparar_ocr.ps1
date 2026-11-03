# Deja listo backend/ocr/tesseract (el Tesseract que viaja dentro de la app).
#
#   ./backend/preparar_ocr.ps1
#
# Descarga el instalador oficial de Windows (Universidad de Mannheim, ver preparar_ocr.py), comprueba
# su huella SHA-256, lo instala en silencio y arma la carpeta con preparar_ocr.py. Se usa en el CI
# (tests y release); en una máquina que ya tiene Tesseract basta `python backend/preparar_ocr.py`.
$ErrorActionPreference = 'Stop'
$version = '5.4.0.20240606'
$sha256 = 'C885FFF6998E0608BA4BB8AB51436E1C6775C2BAFC2559A19B423E18678B60C9'
$url = "https://github.com/UB-Mannheim/tesseract/releases/download/v$version/tesseract-ocr-w64-setup-$version.exe"
$instalador = Join-Path ([IO.Path]::GetTempPath()) "tesseract-setup-$version.exe"
$destino = 'C:\Program Files\Tesseract-OCR'

if (-not (Test-Path (Join-Path $destino 'tesseract.exe'))) {
  Invoke-WebRequest -Uri $url -OutFile $instalador
  $huella = (Get-FileHash $instalador -Algorithm SHA256).Hash
  if ($huella -ne $sha256) { throw "La huella del instalador de Tesseract no coincide ($huella)." }
  Start-Process -FilePath $instalador -ArgumentList '/S' -Wait
  if (-not (Test-Path (Join-Path $destino 'tesseract.exe'))) { throw "El instalador no dejó Tesseract en $destino" }
}
python -m pip install --quiet pefile
python (Join-Path $PSScriptRoot 'preparar_ocr.py') --origen $destino
if ($LASTEXITCODE -ne 0) { throw 'preparar_ocr.py falló' }
