# PowerShell wrapper for scripts/migrate_all.py.
# Default scope is all chains: main, game, blocks, logs.

param(
    [ValidateSet("all", "main", "game", "blocks", "logs")]
    [string]$Scope = "all"
)

$ErrorActionPreference = "Stop"
Write-Host "Running migrations (scope=$Scope)..." -ForegroundColor Green
python scripts/migrate_all.py --scope $Scope

if ($LASTEXITCODE -eq 0) {
    Write-Host "Migration completed successfully!" -ForegroundColor Green
    exit 0
}

Write-Host "Migration failed!" -ForegroundColor Red
exit $LASTEXITCODE
