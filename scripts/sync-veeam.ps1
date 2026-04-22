<#
.SYNOPSIS
  Pushes the latest Veeam backup session results to Backup Check.

.DESCRIPTION
  Runs on the Veeam Backup & Replication host. Reads completed sessions
  from the last N hours (default 18), keeps the latest session per job,
  maps Success/Warning/Failed and POSTs the batch to /api/sync on the
  Backup Check server. Manual quittances in the app are never overwritten.

.PARAMETER TargetDate
  Date (YYYY-MM-DD) that the results should be booked under in Backup Check.
  Default: today.

.PARAMETER LookbackHours
  How many hours to look back for finished sessions. Default: 18.

.PARAMETER Endpoint
  Sync URL. Default: $env:BACKUP_CHECK_URL or http://localhost:3000/api/sync

.PARAMETER Token
  Bearer token. Default: $env:BACKUP_CHECK_TOKEN
  Must match SYNC_TOKEN configured in docker-compose on the app host.

.PARAMETER IncludeCopyJobs
  Include Backup-Copy child sessions (JobNames like "CopyPolicy\VmName").
  Default: off — only primary jobs are synced.

.PARAMETER DryRun
  Print the payload and skip the HTTP call. Also prints diagnostic info
  about the first session so Result-mapping can be verified.

.EXAMPLE
  .\sync-veeam.ps1 -DryRun

.EXAMPLE
  .\sync-veeam.ps1 -TargetDate 2026-04-20 -LookbackHours 72
#>

[CmdletBinding()]
param(
  [string] $TargetDate       = (Get-Date -Format 'yyyy-MM-dd'),
  [int]    $LookbackHours    = 18,
  [string] $Endpoint         = $(if ($env:BACKUP_CHECK_URL) { $env:BACKUP_CHECK_URL } else { 'http://localhost:3000/api/sync' }),
  [string] $Token            = $env:BACKUP_CHECK_TOKEN,
  [switch] $IncludeCopyJobs,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Info ($m) { Write-Host "[Backup-Check] $m" }
function Write-Warn ($m) { Write-Warning "[Backup-Check] $m" }
function Write-Fail ($m) { Write-Error   "[Backup-Check] $m" }

# ----------------------------------------------------------------------------
# Result -> App-Status (robust: Enum-Name, Integer und String alle akzeptiert)
# ----------------------------------------------------------------------------
function Get-StatusFromResult {
  param($Result)

  if ($null -eq $Result) { return 'warning' }

  # Integer-Pfad (Veeam.Backup.Common.EResult: None=-1, Success=0, Warning=1, Failed=2)
  try {
    $int = [int]$Result
    switch ($int) {
      0 { return 'success' }
      1 { return 'warning' }
      2 { return 'failed'  }
    }
  } catch {}

  # String-Pfad (Enum.ToString() oder eigenes String)
  $s = "$Result"
  if ($s -match '(?i)success') { return 'success' }
  if ($s -match '(?i)warning') { return 'warning' }
  if ($s -match '(?i)failed|fail|error') { return 'failed' }

  return 'warning'   # None / InProgress / unbekannt -> sichtbar machen
}

# ----------------------------------------------------------------------------
# 1. Veeam PowerShell laden
# ----------------------------------------------------------------------------
try {
  if (Get-Module -ListAvailable -Name Veeam.Backup.PowerShell) {
    Import-Module Veeam.Backup.PowerShell -DisableNameChecking -ErrorAction Stop
  } elseif (Get-PSSnapin -Registered -Name VeeamPSSnapin -ErrorAction SilentlyContinue) {
    Add-PSSnapin VeeamPSSnapin -ErrorAction Stop
  } else {
    Write-Fail 'Veeam PowerShell module/snapin not found on this host.'
    exit 3
  }
} catch {
  Write-Fail "Failed to load Veeam PowerShell: $_"
  exit 3
}

if (-not $Token -and -not $DryRun) {
  Write-Fail 'No token. Set environment variable BACKUP_CHECK_TOKEN or pass -Token.'
  exit 2
}

# ----------------------------------------------------------------------------
# 2. Sessions einsammeln
# ----------------------------------------------------------------------------
$endWindow   = Get-Date
$startWindow = $endWindow.AddHours(-$LookbackHours)
Write-Info "Target date   : $TargetDate"
Write-Info "Lookback      : $startWindow  ->  $endWindow"

$sessions = Get-VBRBackupSession | Where-Object {
  $_.EndTime -and $_.EndTime -ge $startWindow -and $_.EndTime -le $endWindow
}

# Optional: Agent-Jobs (File-Server etc.)
try {
  $agent = Get-VBRComputerBackupJobSession -ErrorAction SilentlyContinue |
    Where-Object { $_.EndTime -and $_.EndTime -ge $startWindow -and $_.EndTime -le $endWindow }
  if ($agent) { $sessions = @($sessions) + @($agent) }
} catch { }

if (-not $sessions) {
  Write-Info 'No sessions in the lookback window. Exiting cleanly.'
  exit 0
}

# Backup-Copy-Child-Sessions rausfiltern (Format: "CopyPolicy\VmName")
if (-not $IncludeCopyJobs) {
  $before = @($sessions).Count
  $sessions = $sessions | Where-Object { $_.JobName -notmatch '\\' }
  $filteredOut = $before - @($sessions).Count
  if ($filteredOut -gt 0) {
    Write-Info "Skipping $filteredOut backup-copy child sessions (use -IncludeCopyJobs to include)"
  }
}

if (-not $sessions) {
  Write-Info 'Nothing left after filtering. Exiting.'
  exit 0
}

# pro JobName letzten Lauf
$latestPerJob = $sessions |
  Group-Object -Property JobName |
  ForEach-Object {
    $_.Group | Sort-Object EndTime -Descending | Select-Object -First 1
  }

Write-Info "Sessions in window: $(@($sessions).Count), unique jobs: $(@($latestPerJob).Count)"

# ----------------------------------------------------------------------------
# 3. Diagnose im DryRun
# ----------------------------------------------------------------------------
if ($DryRun -and $latestPerJob) {
  $samples = $latestPerJob | Select-Object -First 3
  Write-Info '--- Diagnose (erste 3 Sessions) ---'
  foreach ($d in $samples) {
    $rtype = if ($null -ne $d.Result) { $d.Result.GetType().FullName } else { '<null>' }
    $mapped = Get-StatusFromResult $d.Result
    Write-Host ("  Job:    {0}" -f $d.JobName)
    Write-Host ("  Result: {0}  (type: {1})" -f $d.Result, $rtype)
    Write-Host ("  State:  {0}" -f $d.State)
    Write-Host ("  End:    {0}" -f $d.EndTime)
    Write-Host ("  -> mapped status: {0}" -f $mapped)
    Write-Host ''
  }
}

# ----------------------------------------------------------------------------
# 4. Auf API-Format mappen
# ----------------------------------------------------------------------------
$results = foreach ($s in $latestPerJob) {
  $status = Get-StatusFromResult $s.Result

  $note = $null
  if ($status -ne 'success') {
    try {
      $details = $s.GetDetails() 2>$null
      if ($details -and $details.Count -gt 0 -and $details[0].Title) {
        $note = ($details[0].Title -replace '\s+', ' ').Trim()
      }
    } catch { }
    if (-not $note -and $s.Info.FailureMessage) {
      $note = $s.Info.FailureMessage
    }
    if ($note -and $note.Length -gt 240) {
      $note = $note.Substring(0, 237) + '...'
    }
  }

  [pscustomobject]@{
    job    = $s.JobName
    status = $status
    note   = $note
  }
}

# Übersicht über die tatsächliche Verteilung
$byStatus = $results | Group-Object status | Sort-Object Name
Write-Info ('Verteilung: ' + (($byStatus | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ', '))

# ----------------------------------------------------------------------------
# 5. Senden
# ----------------------------------------------------------------------------
$payload = [ordered]@{
  date    = $TargetDate
  results = @($results)
}
$json = $payload | ConvertTo-Json -Depth 5

if ($DryRun) {
  Write-Info 'Dry run — payload:'
  Write-Host $json
  exit 0
}

Write-Info "Sending $(@($results).Count) results to $Endpoint"
try {
  $response = Invoke-RestMethod `
    -Uri         $Endpoint `
    -Method      POST `
    -Headers     @{ Authorization = "Bearer $Token" } `
    -ContentType 'application/json; charset=utf-8' `
    -Body        ([System.Text.Encoding]::UTF8.GetBytes($json)) `
    -TimeoutSec  30

  Write-Info ('Inserted:       {0}' -f $response.inserted)
  Write-Info ('Updated:        {0}' -f $response.updated)
  Write-Info ('Skipped manual: {0}' -f $response.skipped_manual)
  if ($response.unknown_jobs -and $response.unknown_jobs.Count -gt 0) {
    Write-Warn ('Unknown jobs (in App nicht vorhanden): {0}' -f ($response.unknown_jobs -join ', '))
  }
  if ($response.invalid_status -and $response.invalid_status.Count -gt 0) {
    Write-Warn ('Invalid status: {0}' -f ($response.invalid_status -join ', '))
  }
} catch {
  Write-Fail ("HTTP call failed: {0}" -f $_.Exception.Message)
  exit 1
}
