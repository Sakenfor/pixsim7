<#
commit_groups.ps1 - Structured local commit helper (no remote required yet)

Usage examples:
  # Dry run: show which commands WOULD execute
  powershell -ExecutionPolicy Bypass -File scripts/commit_groups.ps1 -DryRun

  # Commit only selected groups (comma-separated keys)
  powershell -ExecutionPolicy Bypass -File scripts/commit_groups.ps1 -Groups docs,pipeline,upload

  # Interactive mode (confirmation per group)
  powershell -ExecutionPolicy Bypass -File scripts/commit_groups.ps1 -Interactive

Parameters:
  -DryRun      : Do not stage or commit; just print planned actions
  -Groups      : Comma-separated list of group keys to process (defaults to all)
  -Interactive : Ask for Y/N before committing each group
  -SkipEmpty   : Automatically skip groups with no matching files (default True)
  -Verbose     : Extra output

Groups defined:
  docs        : Architecture & logging docs
  pipeline    : Submission pipeline + artifact model + worker integration
  upload      : Upload service + image utils + assets API changes
  logging     : Shared logging package + requirements + middleware
  frontend    : Scene editor & layout/components additions
  launcher    : Launcher GUI tool
  config      : Environment/workspace config changes
  tests       : New test files (python + typescript)

Extend: Add new hashtable entry in $CommitGroups.
#>
param(
    [switch]$DryRun,
    [string]$Groups = '',
    [switch]$Interactive,
    [switch]$SkipEmpty = $true,
    [switch]$Verbose
)

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERR]  $msg" -ForegroundColor Red }

# Root for relative paths
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Define commit groups: key -> @{ Paths = <string[]>; Message = <string> }
$CommitGroups = [ordered]@{
  docs = @{ Paths = @(
      'docs/ARCHITECTURE_AUDIT_CLAUDE_TASKS.md',
      'docs/SCENE_EDITOR_CLAUDE_TASKS.md',
      'docs/CONTROL_CENTER_REFACTOR_CLAUDE.md',
      'docs/PROVIDER_ACCOUNT_STRATEGY.md',
      'docs/GAME_BACKEND_SIM_SPEC.md',
      'pixsim7_backend/PIXVERSE_INTEGRATION.md',
      'LOGGING_STRUCTURE.md'
    ); Message = 'docs: architecture & logging updates'; }
  pipeline = @{ Paths = @(
      'pixsim7_backend/domain/generation_artifact.py',
      'pixsim7_backend/services/submission',
      'pixsim7_backend/workers/job_processor.py'
    ); Message = 'feat(pipeline): submission pipeline + artifact model integration'; }
  upload = @{ Paths = @(
      'pixsim7_backend/services/upload',
      'pixsim7_backend/shared/image_utils.py',
      'pixsim7_backend/api/v1/assets.py'
    ); Message = 'feat(upload): provider-preferring asset upload & image processing'; }
  logging = @{ Paths = @(
      'pixsim_logging',
      'pixsim7_backend/api/middleware.py',
      'pixsim7_backend/requirements.txt'
    ); Message = 'feat(logging): shared logging package & middleware wiring'; }
  frontend = @{ Paths = @(
      'frontend/src/components',
      'frontend/src/modules/scene-builder',
      'frontend/src/stores',
      'frontend/src/App.tsx',
      'frontend/src/routes',
      'frontend/tailwind.config.ts',
      'frontend/tsconfig.app.json'
    ); Message = 'feat(frontend): scene editor expansion & layout updates'; }
  launcher = @{ Paths = @(
      'scripts/launcher.py',
      'scripts/launcher_gui'
    ); Message = 'feat(devtools): add local launcher GUI'; }
  config = @{ Paths = @(
      'environment.yml',
      'pnpm-workspace.yaml',
      'tsconfig.base.json',
      'package.json',
      'frontend/package.json'
    ); Message = 'chore(config): workspace & environment setup'; }
  tests = @{ Paths = @(
      'tests/test_submission_pipeline.py',
      'tests/test_upload_service.py',
      'tests/pipeline_test_runner.py',
      'tests/test_node_palette_integration.ts',
      'tests/test_scene_runtime_mapping.ts'
    ); Message = 'test: pipeline, upload, scene editor runtime'; }
}

if ($Groups -ne '') {
  $requested = $Groups.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  $invalid = $requested | Where-Object { -not $CommitGroups.Contains($_) }
  if ($invalid) { Write-Err "Unknown group keys: $($invalid -join ', ')"; exit 1 }
  $CommitGroups = [ordered]@{ foreach($k in $requested){ $k = $k; $CommitGroups[$k] } }
}

# Pre-flight: ensure git available
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Err 'git not found in PATH'; exit 1 }

$originalBranch = (git branch --show-current).Trim()
Write-Info "Current branch: $originalBranch"

# Verify working tree state once
Write-Info 'Scanning groups...'
$Summary = @()
foreach ($kv in $CommitGroups.GetEnumerator()) {
  $key = $kv.Key; $spec = $kv.Value
  $paths = @()
  foreach ($p in $spec.Paths) {
    if (Test-Path $p) { $paths += $p }
  }
  $hasChanges = $false
  if ($paths.Count -gt 0) {
    # Use git diff --name-only for modified/untracked inside paths
    $diffNames = (git status --porcelain $paths | ForEach-Object { $_.Substring(3) }) 2>$null
    if ($diffNames) { $hasChanges = $true }
  }
  $Summary += [pscustomobject]@{ Group=$key; Paths=$paths.Count; Changed=$hasChanges }
}

if ($Verbose) { $Summary | Format-Table }

foreach ($kv in $CommitGroups.GetEnumerator()) {
  $key = $kv.Key; $spec = $kv.Value
  $msg = $spec.Message
  $existingPaths = @()
  foreach ($p in $spec.Paths) { if (Test-Path $p) { $existingPaths += $p } }
  if ($existingPaths.Count -eq 0 -and $SkipEmpty) { Write-Warn "Skipping '$key' (no paths present)"; continue }

  # Determine if any changes to stage
  $statusLines = (git status --porcelain $existingPaths | ForEach-Object { $_ })
  if ($statusLines.Count -eq 0 -and $SkipEmpty) { Write-Warn "Skipping '$key' (no changes)"; continue }

  Write-Info "Preparing group '$key' ($($existingPaths.Count) paths)"
  if ($DryRun) {
    Write-Host "DRYRUN: git add $existingPaths" -ForegroundColor Magenta
    Write-Host "DRYRUN: git commit -m \"$msg\"" -ForegroundColor Magenta
    continue
  }

  if ($Interactive) {
    $answer = Read-Host "Commit group '$key'? (y/n)"
    if ($answer -notin @('y','Y')) { Write-Warn "Skipped group '$key' by user"; continue }
  }

  git add $existingPaths
  if ($LASTEXITCODE -ne 0) { Write-Err "git add failed for group '$key'"; exit 1 }
  # Avoid empty commits (in case of only deleted paths) by checking index diff
  $pending = (git diff --cached --name-only)
  if (-not $pending) { Write-Warn "No staged changes for '$key', skipping commit"; continue }
  git commit -m $msg
  if ($LASTEXITCODE -ne 0) { Write-Err "Commit failed for group '$key'"; exit 1 }
  Write-Info "Committed group '$key'"
}

Write-Info 'Done.'
if ($DryRun) { Write-Info 'Dry run complete - no changes applied.' }
