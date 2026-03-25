param(
    [int]$DurationSec = 600,
    [double]$IntervalSec = 2.0,
    [string]$OutPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ProcessListByCommandPattern {
    param(
        [string]$Name,
        [string]$Pattern
    )
    $filter = "Name='$Name'"
    $rows = Get-CimInstance Win32_Process -Filter $filter -ErrorAction SilentlyContinue
    if (-not $rows) {
        return @()
    }
    return @(
        $rows | Where-Object { $_.CommandLine -and $_.CommandLine -match $Pattern }
    )
}

function Expand-ProcessTreePids {
    param(
        [int[]]$RootPids,
        [object[]]$ProcessRows
    )
    if (-not $RootPids -or -not $ProcessRows) {
        return @()
    }

    $set = New-Object 'System.Collections.Generic.HashSet[int]'
    foreach ($rootPid in $RootPids) {
        if ($null -ne $rootPid) {
            [void]$set.Add([int]$rootPid)
        }
    }

    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($proc in $ProcessRows) {
            $childPid = [int]$proc.ProcessId
            $ppid = [int]$proc.ParentProcessId
            if ($set.Contains($ppid) -and -not $set.Contains($childPid)) {
                [void]$set.Add($childPid)
                $changed = $true
            }
        }
    }

    return @($set)
}

function Get-ConnectionsByPidSet {
    param(
        [object[]]$Connections,
        [int[]]$Pids
    )
    if (-not $Connections -or -not $Pids) {
        return @()
    }
    $set = New-Object 'System.Collections.Generic.HashSet[int]'
    foreach ($ownedPid in $Pids) {
        if ($null -ne $ownedPid) {
            [void]$set.Add([int]$ownedPid)
        }
    }
    return @(
        $Connections | Where-Object { $set.Contains([int]$_.OwningProcess) }
    )
}

function Get-StateCountMap {
    param(
        [object[]]$Connections
    )
    $map = [ordered]@{
        Established = 0
        SynSent = 0
        CloseWait = 0
        FinWait2 = 0
        TimeWait = 0
        Listen = 0
    }
    if (-not $Connections) {
        return $map
    }

    $groups = $Connections | Group-Object -Property State
    foreach ($g in $groups) {
        $name = [string]$g.Name
        switch ($name) {
            "Established" { $map.Established = $g.Count }
            "SynSent" { $map.SynSent = $g.Count }
            "CloseWait" { $map.CloseWait = $g.Count }
            "FinWait2" { $map.FinWait2 = $g.Count }
            "TimeWait" { $map.TimeWait = $g.Count }
            "Listen" { $map.Listen = $g.Count }
            default {}
        }
    }
    return $map
}

function Get-PortSummary {
    param(
        [object[]]$Connections,
        [int[]]$Ports
    )
    $rows = @()
    foreach ($port in $Ports) {
        $subset = @($Connections | Where-Object {
            $_.LocalPort -eq $port -or $_.RemotePort -eq $port
        })
        if (-not $subset) {
            $rows += [ordered]@{
                port = $port
                total = 0
                states = @{}
            }
            continue
        }
        $stateGroups = $subset | Group-Object -Property State
        $stateMap = @{}
        foreach ($g in $stateGroups) {
            $stateMap[[string]$g.Name] = [int]$g.Count
        }
        $rows += [ordered]@{
            port = $port
            total = [int]$subset.Count
            states = $stateMap
        }
    }
    return $rows
}

function Get-TopStressByProcess {
    param(
        [object[]]$Connections
    )
    $stress = $Connections | Where-Object {
        $_.State -in @("SynSent", "CloseWait", "FinWait2")
    }
    if (-not $stress) {
        return @()
    }

    $grouped = $stress | Group-Object -Property OwningProcess, State | Sort-Object Count -Descending
    $top = $grouped | Select-Object -First 20

    $result = @()
    foreach ($g in $top) {
        $sample = $g.Group | Select-Object -First 1
        $ownerPid = [int]$sample.OwningProcess
        $proc = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
        $result += [ordered]@{
            pid = $ownerPid
            process = if ($proc) { $proc.ProcessName } else { $null }
            state = [string]$sample.State
            count = [int]$g.Count
        }
    }
    return $result
}

function Get-SafeCount {
    param(
        [object]$Value
    )
    if ($null -eq $Value) {
        return 0
    }
    if ($Value -is [System.Collections.ICollection]) {
        return [int]$Value.Count
    }
    return 1
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$diagDir = Join-Path $repoRoot "tmp\diagnostics"
if (-not (Test-Path $diagDir)) {
    New-Item -ItemType Directory -Path $diagDir | Out-Null
}

if ([string]::IsNullOrWhiteSpace($OutPath)) {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutPath = Join-Path $diagDir "flap_watch_${stamp}.jsonl"
}

$pixverseEdges = @("104.18.13.127", "104.18.12.127")
$portsToWatch = @(8000, 6380, 5432, 5433, 5436)
$startTime = Get-Date
$endTime = $startTime.AddSeconds($DurationSec)

Write-Host "Writing diagnostics to: $OutPath"
Write-Host "DurationSec=$DurationSec IntervalSec=$IntervalSec"

while ((Get-Date) -lt $endTime) {
    $now = Get-Date
    $all = @(Get-NetTCPConnection -ErrorAction SilentlyContinue)

    $pythonRows = @(
        Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue
    )
    $backendRows = Get-ProcessListByCommandPattern -Name "python.exe" -Pattern "uvicorn\s+pixsim7\.backend\.main\.main:app"
    $launcherRows = Get-ProcessListByCommandPattern -Name "python.exe" -Pattern "-m\s+launcher\.gui\.launcher"
    $workerRows = Get-ProcessListByCommandPattern -Name "python.exe" -Pattern "-m\s+arq"

    $backendRootPids = @($backendRows | ForEach-Object { [int]$_.ProcessId })
    $launcherRootPids = @($launcherRows | ForEach-Object { [int]$_.ProcessId })
    $workerRootPids = @($workerRows | ForEach-Object { [int]$_.ProcessId })

    $backendTreePids = Expand-ProcessTreePids -RootPids $backendRootPids -ProcessRows $pythonRows
    $workerTreePids = Expand-ProcessTreePids -RootPids $workerRootPids -ProcessRows $pythonRows
    $providerTreePids = @($backendTreePids + $workerTreePids | Select-Object -Unique)

    $backendPid = if (Get-SafeCount -Value $backendRootPids) { [int]$backendRootPids[0] } else { $null }
    $launcherPid = if (Get-SafeCount -Value $launcherRootPids) { [int]$launcherRootPids[0] } else { $null }
    $workerPid = if (Get-SafeCount -Value $workerRootPids) { [int]$workerRootPids[0] } else { $null }

    $backendConns = Get-ConnectionsByPidSet -Connections $all -Pids $backendTreePids
    $workerConns = Get-ConnectionsByPidSet -Connections $all -Pids $workerTreePids
    $providerConns = Get-ConnectionsByPidSet -Connections $all -Pids $providerTreePids

    $backend443 = @($backendConns | Where-Object { $_.RemotePort -eq 443 })
    $backendPixverse443 = @($backend443 | Where-Object { $_.RemoteAddress -in $pixverseEdges })
    $provider443 = @($providerConns | Where-Object { $_.RemotePort -eq 443 })
    $providerPixverse443 = @($provider443 | Where-Object { $_.RemoteAddress -in $pixverseEdges })
    $backendLocalRedis = @($backendConns | Where-Object { $_.RemotePort -eq 6380 -or $_.LocalPort -eq 6380 })
    $backendLocalApi = @($backendConns | Where-Object { $_.RemotePort -eq 8000 -or $_.LocalPort -eq 8000 })

    $globalStates = Get-StateCountMap -Connections $all
    $backendStates = Get-StateCountMap -Connections $backendConns
    $workerStates = Get-StateCountMap -Connections $workerConns
    $providerStates = Get-StateCountMap -Connections $providerConns
    $portSummary = Get-PortSummary -Connections $all -Ports $portsToWatch
    $topStress = Get-TopStressByProcess -Connections $all

    $row = [ordered]@{
        ts = $now.ToString("o")
        backend_pid = $backendPid
        launcher_pid = $launcherPid
        worker_pid = $workerPid
        backend_root_pids = $backendRootPids
        worker_root_pids = $workerRootPids
        backend_tree_pids = $backendTreePids
        worker_tree_pids = $workerTreePids
        global_states = $globalStates
        backend_states = $backendStates
        worker_states = $workerStates
        provider_states = $providerStates
        backend_total_connections = (Get-SafeCount -Value $backendConns)
        backend_443_connections = (Get-SafeCount -Value $backend443)
        backend_pixverse_443_connections = (Get-SafeCount -Value $backendPixverse443)
        worker_total_connections = (Get-SafeCount -Value $workerConns)
        provider_total_connections = (Get-SafeCount -Value $providerConns)
        provider_443_connections = (Get-SafeCount -Value $provider443)
        provider_pixverse_443_connections = (Get-SafeCount -Value $providerPixverse443)
        backend_redis_connections = (Get-SafeCount -Value $backendLocalRedis)
        backend_api8000_connections = (Get-SafeCount -Value $backendLocalApi)
        ports = $portSummary
        top_stress = $topStress
    }

    $json = $row | ConvertTo-Json -Depth 8 -Compress
    Add-Content -Path $OutPath -Value $json

    $backendPidText = if ($null -eq $backendPid) { "-" } else { [string]$backendPid }
    $line = "{0} backend={1} p443={2} pPix={3} syn={4} cw={5} fw2={6} tw={7}" -f `
        $now.ToString("HH:mm:ss"), `
        $backendPidText, `
        $row.provider_443_connections, `
        $row.provider_pixverse_443_connections, `
        $globalStates.SynSent, `
        $globalStates.CloseWait, `
        $globalStates.FinWait2, `
        $globalStates.TimeWait
    Write-Host $line

    Start-Sleep -Milliseconds ([int]([Math]::Max(200, $IntervalSec * 1000)))
}

$events = @(Get-WinEvent -FilterHashtable @{
    LogName = "System"
    Id = 4227
    StartTime = $startTime
} -ErrorAction SilentlyContinue)

$summary = [ordered]@{
    ts = (Get-Date).ToString("o")
    type = "summary"
    out_path = $OutPath
    run_started = $startTime.ToString("o")
    run_ended = (Get-Date).ToString("o")
    tcpip_4227_count = [int]$events.Count
    tcpip_4227_times = @($events | Select-Object -ExpandProperty TimeCreated | ForEach-Object { $_.ToString("o") })
}
Add-Content -Path $OutPath -Value ($summary | ConvertTo-Json -Depth 6 -Compress)

Write-Host "Done. Summary written to $OutPath"
