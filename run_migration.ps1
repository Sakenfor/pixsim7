# PowerShell script to run database migrations

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$alembicConfig = Join-Path $projectRoot "alembic.ini"

if (-not (Test-Path $alembicConfig)) {
    Write-Host "alembic.ini not found at: $alembicConfig" -ForegroundColor Red
    exit 1
}

# Ensure imports work (alembic env.py loads app settings/models)
$env:PYTHONPATH = $projectRoot

Write-Host "Running database migrations..." -ForegroundColor Green
alembic -c $alembicConfig upgrade head

if ($LASTEXITCODE -eq 0) {
    Write-Host "Migration completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Migration failed!" -ForegroundColor Red
    exit 1
}
