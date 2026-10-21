[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $projectRoot '.local'
$dataPath = Join-Path $localRoot 'pgdata'
$pgCtl = Join-Path $localRoot 'postgres\package\native\bin\pg_ctl.exe'

if (-not (Test-Path -LiteralPath $pgCtl) -or -not (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
    Write-Host 'No hay una instancia PostgreSQL local inicializada para este proyecto.'
    exit 0
}

& $pgCtl -D $dataPath status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'La instancia PostgreSQL local ya esta detenida.'
    exit 0
}

& $pgCtl -D $dataPath -m fast -w stop
if ($LASTEXITCODE -ne 0) { throw 'No se pudo detener la instancia PostgreSQL de este proyecto.' }
Write-Host 'PostgreSQL local detenido. Los datos permanecen en .local/pgdata.'
