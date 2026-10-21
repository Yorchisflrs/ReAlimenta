[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 55432
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $projectRoot '.local'
$dataPath = Join-Path $localRoot 'pgdata'
$runtimePath = Join-Path $localRoot 'postgres'
$binPath = Join-Path $runtimePath 'package\native\bin'
$envPath = Join-Path $projectRoot '.env'
$version = '17.10.0-beta.17'
$archiveName = "embedded-postgres-windows-x64-$version.tgz"
$archivePath = Join-Path $localRoot "downloads\$archiveName"
$integrity = 'sha512-q6xIETTkv67i1QlTWz1LAKb3Z+vG2V3qrp+BjLEWhCQ9jE4hbbsQ/J/3wiOPFLJbuwak7CfHC9EUJG7txAbGKw=='
$expectedHash = [System.BitConverter]::ToString([System.Convert]::FromBase64String($integrity.Substring(7))).Replace('-', '').ToLowerInvariant()
$downloadUrl = "https://registry.npmjs.org/@embedded-postgres/windows-x64/-/windows-x64-$version.tgz"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Assert-NativeSuccess([string]$Action) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Action fallo (codigo $LASTEXITCODE)."
    }
}

New-Item -ItemType Directory -Path $localRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $localRoot 'downloads') -Force | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $binPath 'pg_ctl.exe'))) {
    if (-not (Test-Path -LiteralPath $archivePath)) {
        Write-Host "Descargando PostgreSQL portable $version..."
        $partialPath = "$archivePath.partial"
        & curl.exe --fail --location --connect-timeout 20 --max-time 900 --retry 3 --retry-delay 2 --silent --show-error --output $partialPath $downloadUrl
        Assert-NativeSuccess 'La descarga de PostgreSQL'
        $downloadHash = (Get-FileHash -LiteralPath $partialPath -Algorithm SHA512).Hash.ToLowerInvariant()
        if ($downloadHash -ne $expectedHash) {
            throw 'El SHA512 del paquete no coincide con dist.integrity de npm. No se ejecutara.'
        }
        Move-Item -LiteralPath $partialPath -Destination $archivePath -Force
    }
    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA512).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        throw 'El paquete local no supera la comprobacion SHA512. No se ejecutara.'
    }

    Write-Host 'Extrayendo los archivos de servidor y cliente PostgreSQL...'
    New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
    $archiveEntries = & tar.exe -tzf $archivePath
    Assert-NativeSuccess 'La inspeccion del paquete PostgreSQL'
    foreach ($entry in $archiveEntries) {
        if ($entry -notmatch '^package/' -or $entry -match '(^|/)\.\.(/|$)' -or $entry.Contains('\')) {
            throw 'El paquete contiene una ruta fuera del directorio permitido.'
        }
    }
    & tar.exe -xzf $archivePath -C $runtimePath
    Assert-NativeSuccess 'La extraccion de PostgreSQL'
    $provenance = @{ package = '@embedded-postgres/windows-x64'; version = $version; url = $downloadUrl; integrity = $integrity } | ConvertTo-Json
    [System.IO.File]::WriteAllText((Join-Path $runtimePath 'source.json'), $provenance, $utf8)
}

$pgCtl = Join-Path $binPath 'pg_ctl.exe'
$initDb = Join-Path $binPath 'initdb.exe'
foreach ($executable in @($pgCtl, $initDb)) {
    if (-not (Test-Path -LiteralPath $executable)) {
        throw 'La extraccion de PostgreSQL esta incompleta.'
    }
}

$envContent = ''
if (Test-Path -LiteralPath $envPath) {
    $envContent = [System.IO.File]::ReadAllText($envPath)
}
$urlMatch = [regex]::Match($envContent, '(?m)^\s*DATABASE_URL\s*=\s*(.+?)\s*$')
if ($urlMatch.Success) {
    $databaseUrl = $urlMatch.Groups[1].Value.Trim().Trim('"').Trim("'")
    try { $connectionUri = [System.Uri]$databaseUrl } catch { throw 'DATABASE_URL no tiene un formato valido.' }
    $userInfo = $connectionUri.UserInfo.Split(':', 2)
    $dbUser = [System.Uri]::UnescapeDataString($userInfo[0])
    $dbPassword = ''
    if ($userInfo.Length -eq 2) { $dbPassword = [System.Uri]::UnescapeDataString($userInfo[1]) }
    if ($connectionUri.Scheme -notin @('postgres', 'postgresql') -or $connectionUri.Host -ne '127.0.0.1' -or $connectionUri.Port -ne $Port -or $dbUser -ne 'realimenta' -or $connectionUri.AbsolutePath.Trim('/') -ne 'realimenta' -or -not $dbPassword) {
        throw 'DATABASE_URL debe apuntar a la base y usuario realimenta en 127.0.0.1 y al puerto local indicado. No se sobrescribio .env.'
    }
} else {
    if (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION')) {
        throw 'Ya existe pgdata pero falta DATABASE_URL. Restaura el .env original; los datos no se modificaron.'
    }
    $randomBytes = New-Object byte[] 32
    $randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $randomGenerator.GetBytes($randomBytes) } finally { $randomGenerator.Dispose() }
    $dbUser = 'realimenta'
    $dbPassword = [System.BitConverter]::ToString($randomBytes).Replace('-', '').ToLowerInvariant()
    $databaseUrl = "postgresql://${dbUser}:${dbPassword}@127.0.0.1:${Port}/realimenta"
    if ($envContent.Length -gt 0 -and -not $envContent.EndsWith("`n")) { $envContent += "`r`n" }
    $envContent += "DATABASE_URL=$databaseUrl`r`n"
    [System.IO.File]::WriteAllText($envPath, $envContent, $utf8)
    Write-Host 'Credencial local generada y guardada en .env.'
}

if (-not (Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
    $passwordFile = Join-Path $localRoot 'initdb-password.tmp'
    try {
        [System.IO.File]::WriteAllText($passwordFile, $dbPassword, $utf8)
        & $initDb -D $dataPath -U $dbUser --encoding=UTF8 --locale=C --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwfile=$passwordFile
        Assert-NativeSuccess 'La inicializacion de PostgreSQL'
    } finally {
        if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
    }
}

& $pgCtl -D $dataPath status 2>&1 | Out-Null
$isRunning = $LASTEXITCODE -eq 0
if (-not $isRunning) {
    if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
        throw "El puerto $Port ya esta ocupado por otro proceso. No se detuvo ni modifico ese proceso."
    }
    $logPath = Join-Path $localRoot 'postgres.log'
    & $pgCtl -D $dataPath -l $logPath -o "-h 127.0.0.1 -p $Port" -w start
    Assert-NativeSuccess 'El arranque de PostgreSQL'
}

$previousUrl = $env:DATABASE_URL
try {
    $env:DATABASE_URL = $databaseUrl
    $probe = @'
const { Client } = require('pg');
(async () => {
    const adminUrl = new URL(process.env.DATABASE_URL);
    adminUrl.pathname = '/postgres';
    const admin = new Client({ connectionString: adminUrl.href });
    await admin.connect();
    try {
        const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname='realimenta'");
        if (!exists.rowCount) await admin.query("CREATE DATABASE realimenta OWNER realimenta ENCODING 'UTF8'");
    } finally { await admin.end(); }
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
        const result = await client.query('SELECT current_database() AS name');
        if (result.rows[0].name !== 'realimenta') throw new Error('DATABASE_MISMATCH');
    } finally { await client.end(); }
})().catch(error => { console.error('No se pudo verificar PostgreSQL:', error.code || 'CONNECTION_ERROR'); process.exitCode = 1; });
'@
    Push-Location $projectRoot
    try {
        $probe | & node --input-type=commonjs
        Assert-NativeSuccess 'La creacion o comprobacion de la base realimenta (ejecuta npm install antes)'
    } finally { Pop-Location }
} finally {
    $env:DATABASE_URL = $previousUrl
}

Write-Host "PostgreSQL listo en 127.0.0.1:$Port, base realimenta. Conexion guardada en .env."
