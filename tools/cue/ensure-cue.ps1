# Installs CUE locally into tools/cue/bin/ if not already present.
# Respects CUE_BIN env var - if set, skips install.
$ErrorActionPreference = "Stop"

$CueVersion = "0.10.1"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $ScriptDir "bin"
$CueBinPath = Join-Path $BinDir "cue.exe"

if ($env:CUE_BIN) {
    Write-Host "CUE_BIN is set ($env:CUE_BIN), skipping install."
    exit 0
}

if (Test-Path $CueBinPath) {
    Write-Host "CUE already installed at $CueBinPath"
    exit 0
}

New-Item -ItemType Directory -Path $BinDir -Force | Out-Null

$Arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") { "arm64" } else { "amd64" }
$Url = "https://github.com/cue-lang/cue/releases/download/v${CueVersion}/cue_v${CueVersion}_windows_${Arch}.zip"
$ZipPath = Join-Path $BinDir "cue.zip"

Write-Host "Downloading CUE v${CueVersion} for windows/${Arch}..."
Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing
Expand-Archive -Path $ZipPath -DestinationPath $BinDir -Force
Remove-Item $ZipPath -Force
Write-Host "Installed CUE to $CueBinPath"
