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
  A typical overnight run (22:00 - 05:00) is covered when the scheduled
  task fires in the morning.

.PARAMETER Endpoint
  Sync URL. Default: $env:BACKUP_CHECK_URL or http://localhost:3000/api/sync

.PARAMETER Token
  Bearer token. Default: $env:BACKUP_CHECK_TOKEN
  Must match SYNC_TOKEN configured in docker-compose on the app host.

.PARAMETER DryRun
  Print the payload and skip the HTTP call.

.EXAMPLE
  .\sync-veeam.ps1
  Sync sessions from the last 18 h, book them under today.

.EXAMPLE
  .\sync-veeam.ps1 -TargetDate 2026-04-20 -LookbackHours 72
  Re-sync the last 3 days into April 20.

.EXAMPLE
  .\sync-veeam.ps1 -DryRun
  Dump the payload without sending.
#>

[CmdletBinding()]
param(
  [string] $TargetDate    = (Get-Date -Format 'yyyy-MM-dd'),
  [int]    $LookbackHours = 18,
  [string] $Endpoint      = $(if ($env:BACKUP_CHECK_URL) { $env:BACKUP_CHECK_URL } else { 'http://localhost:3000/api/sync' }),
  [string] $Token         = $env:BACKUP_CHECK_TOKEN,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Info  ($m) { Write-Host "[Backup-Check] $m" }
function Write-Warn  ($m) { Write-Warning "[Backup-Check] $m" }
function Write-Fail  ($m) { Write-Error   "[Backup-Check] $m" }

# --- 1. Veeam PowerShell laden ----------------------------------------------
try {
  if (Get-Module -ListAvailable -Name Veeam.Backup.PowerShell) {
    Import-Module Veeam.Backup.PowerShell -ErrorAction Stop
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

# --- 2. Sessions einsammeln --------------------------------------------------
$endWindow   = Get-Date
$startWindow = $endWindow.AddHours(-$LookbackHours)
Write-Info "Target date   : $TargetDate"
Write-Info "Lookback      : $startWindow  ->  $endWindow"

$allSessions = Get-VBRBackupSession
$sessionsInWindow = $allSessions | Where-Object {
  $_.EndTime -and $_.EndTime -ge $startWindow -and $_.EndTime -le $endWindow
}

# Agent / Tape / BackupCopy sessions (optional, auskommentieren falls nicht benötigt)
try {
  $agentSessions = Get-VBRComputerBackupJobSession -ErrorAction SilentlyContinue |
    Where-Object { $_.EndTime -and $_.EndTime -ge $startWindow -and $_.EndTime -le $endWindow }
  if ($agentSessions) { $sessionsInWindow = @($sessionsInWindow) + @($agentSessions) }
} catch { }

if (-not $sessionsInWindow) {
  Write-Info 'No sessions in the lookback window. Exiting cleanly.'
  exit 0
}

# pro Job nur letzten Lauf nehmen
$latestPerJob = $sessionsInWindow |
  Group-Object -Property JobName |
  ForEach-Object {
    $_.Group | Sort-Object EndTime -Descending | Select-Object -First 1
  }

Write-Info "Sessions found: $($sessionsInWindow.Count) total, $($latestPerJob.Count) unique jobs"

# --- 3. Auf API-Format mappen -----------------------------------------------
$results = foreach ($s in $latestPerJob) {
  $resultText = if ($s.Result) { $s.Result.ToString() } else { 'None' }
  $status = switch ($resultText) {
    'Success' { 'success' }
    'Warning' { 'warning' }
    'Failed'  { 'failed'  }
    default   { 'warning' }   # InProgress / None / unbekannt -> Warnung, damit es auffällt
  }

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

# --- 4. Senden ---------------------------------------------------------------
$payload = [ordered]@{
  date    = $TargetDate
  results = @($results)
}
$json = $payload | ConvertTo-Json -Depth 5 -Compress:$false

if ($DryRun) {
  Write-Info 'Dry run — payload below:'
  Write-Host $json
  exit 0
}

Write-Info "Sending $($results.Count) results to $Endpoint"
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
    Write-Warn ('Unknown jobs (Name-Mismatch zwischen Veeam und App): {0}' -f ($response.unknown_jobs -join ', '))
  }
  if ($response.invalid_status -and $response.invalid_status.Count -gt 0) {
    Write-Warn ('Invalid status: {0}' -f ($response.invalid_status -join ', '))
  }
} catch {
  Write-Fail ("HTTP call failed: {0}" -f $_.Exception.Message)
  exit 1
}
