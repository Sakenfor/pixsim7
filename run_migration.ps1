# PowerShell script to run database migrations

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dbPath = Join-Path $projectRoot "pixsim7_backend\infrastructure\database"

Set-Location $dbPath
$env:PYTHONPATH = $projectRoot

Write-Host "Running database migrations..." -ForegroundColor Green
alembic upgrade head

if ($LASTEXITCODE -eq 0) {
    Write-Host "Migration completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Migration failed!" -ForegroundColor Red
    exit 1
}
