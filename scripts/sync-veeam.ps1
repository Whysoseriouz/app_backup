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
  Default: off - only primary jobs are synced.

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
# Result -> App-Status
# Zuerst String-Match (verlaesslich ueber alle Session-Typen, Success-Enum-
# Name ist konstant). Integer nur als Fallback und nur wenn der String
# numerisch aussieht - verschiedene Veeam-Enums haben unterschiedliche
# Integer-Layouts und das hatten wir schon als Bug.
# ----------------------------------------------------------------------------
function Get-StatusFromResult {
  param($Result)

  if ($null -eq $Result) { return 'warning' }

  $s = "$Result".Trim()

  # Exakte Enum-Namen
  if ($s -ieq 'Success')    { return 'success' }
  if ($s -ieq 'Warning')    { return 'warning' }
  if ($s -ieq 'Failed')     { return 'failed'  }
  if ($s -ieq 'None')       { return 'warning' }
  if ($s -ieq 'InProgress') { return 'warning' }
  if ($s -ieq 'Working')    { return 'warning' }
  if ($s -ieq 'Starting')   { return 'warning' }

  # Substring-Match fuer kombinierte Namen
  if ($s -match '(?i)\bsuccess\b')              { return 'success' }
  if ($s -match '(?i)\bwarning\b')              { return 'warning' }
  if ($s -match '(?i)\bfailed?\b|\berror\b')    { return 'failed'  }

  # Nur Integer-Fallback wenn die String-Repraesentation wirklich eine Zahl ist
  if ($s -match '^-?\d+$') {
    try {
      switch ([int]$s) {
        0 { return 'success' }
        1 { return 'warning' }
        2 { return 'failed'  }
      }
    } catch {}
  }

  return 'warning'
}

# ----------------------------------------------------------------------------
# JobName normalisieren - primaere Backup-Sessions haben .JobName, Agent-
# und einige andere Session-Typen nur .Name
# ----------------------------------------------------------------------------
function Get-NormalizedJobName {
  param($Session)
  if ($Session.JobName) {
    $n = "$($Session.JobName)".Trim()
    if ($n) { return $n }
  }
  if ($Session.Name) {
    $n = "$($Session.Name)".Trim()
    if ($n) { return $n }
  }
  return $null
}

# ----------------------------------------------------------------------------
# Helper: verschachtelte Property-Pfade wie "Info.Reason" sicher aufloesen
# ----------------------------------------------------------------------------
function Get-NestedProperty {
  param($Object, [string]$Path)
  $val = $Object
  foreach ($p in ($Path -split '\.')) {
    if ($null -eq $val) { return $null }
    try { $val = $val.$p } catch { return $null }
  }
  return $val
}

# ----------------------------------------------------------------------------
# Fehler-/Warn-Text einer Session zusammentragen
# ----------------------------------------------------------------------------
function Get-SessionNote {
  param($Session, [switch]$DebugVerbose)

  $msgs = [System.Collections.Generic.List[string]]::new()
  function Add-Msg($m) {
    if (-not $m) { return }
    $t = ("$m" -replace '\s+', ' ').Trim()
    if ($t) { $msgs.Add($t) }
  }

  # 1. Session.GetDetails()  (meist kurze Zusammenfassung)
  try {
    $details = $Session.GetDetails()
    if ($DebugVerbose) {
      Write-Host ("    [dbg] GetDetails -> {0} item(s)" -f @($details).Count)
    }
    foreach ($d in $details) {
      $dTitle = "$($d.Title)".Trim()
      $dDesc  = "$($d.Description)".Trim()
      if ($DebugVerbose -and ($dTitle -or $dDesc)) {
        Write-Host ("    [dbg] detail title='{0}' desc='{1}'" -f $dTitle, $dDesc)
      }
      if ($dTitle -match '(?i)warn|fail|error' -or $dDesc -match '(?i)warn|fail|error') {
        if ($dTitle -and $dDesc -and $dTitle -ne $dDesc) { Add-Msg "$dTitle | $dDesc" }
        elseif ($dTitle) { Add-Msg $dTitle }
        elseif ($dDesc)  { Add-Msg $dDesc }
      }
    }
  } catch {
    if ($DebugVerbose) { Write-Host "    [dbg] GetDetails exception: $_" }
  }

  # 2. Task-Sessions (pro VM) - Result liegt oft auf .Info.Result
  try {
    $tasks = Get-VBRTaskSession -Session $Session -ErrorAction SilentlyContinue
    if ($DebugVerbose) {
      Write-Host ("    [dbg] Get-VBRTaskSession -> {0} task(s)" -f @($tasks).Count)
    }
    foreach ($t in $tasks) {
      $taskResult = $null
      foreach ($pc in @('Info.Result','Status','Result','Info.Status')) {
        $v = Get-NestedProperty $t $pc
        if ($v) { $taskResult = "$v"; break }
      }
      if ($DebugVerbose) {
        Write-Host ("    [dbg] task '{0}' result={1}" -f $t.Name, $taskResult)
      }
      if (-not $taskResult -or $taskResult -notmatch '(?i)warning|failed') { continue }

      $reason = $null
      foreach ($pc in @('Info.Reason','Info.Description','Info.Title','Info.FailureMessage','Reason','Description','Title','FailureMessage')) {
        $v = Get-NestedProperty $t $pc
        if ($v) { $reason = "$v"; break }
      }
      if ($DebugVerbose -and $reason) {
        Write-Host ("    [dbg] task '{0}' reason='{1}'" -f $t.Name, $reason)
      }
      if ($reason) {
        $name = "$($t.Name)".Trim()
        if ($name) { Add-Msg ("${name}: $reason") } else { Add-Msg $reason }
      }
    }
  } catch {
    if ($DebugVerbose) { Write-Host "    [dbg] Get-VBRTaskSession exception: $_" }
  }

  # 3. Session.Logger.GetLog()  (Fallback statt Get-VBRSessionLog, das manche Versionen nicht haben)
  if ($msgs.Count -eq 0) {
    try {
      $logger = $Session.Logger
      if ($logger) {
        $records = @($logger.GetLog())
        if ($DebugVerbose) {
          Write-Host ("    [dbg] session.Logger.GetLog() -> {0} record(s)" -f $records.Count)
        }
        foreach ($r in $records) {
          $status = "$($r.Status)"
          if ($status -notmatch '(?i)warn|fail|error') { continue }
          $title = "$($r.Title)".Trim()
          $desc  = "$($r.Description)".Trim()
          if ($DebugVerbose) {
            Write-Host ("    [dbg] log [{0}] title='{1}' desc='{2}'" -f $status, $title, $desc)
          }
          if ($title -and $desc -and ($desc -ne $title)) { Add-Msg "$title | $desc" }
          elseif ($title) { Add-Msg $title }
          elseif ($desc)  { Add-Msg $desc }
        }
      } elseif ($DebugVerbose) {
        Write-Host '    [dbg] session has no Logger property'
      }
    } catch {
      if ($DebugVerbose) { Write-Host "    [dbg] Logger.GetLog exception: $_" }
    }
  }

  # 4. Get-VBRSessionLog (falls das Cmdlet in dieser Veeam-Version existiert)
  if ($msgs.Count -eq 0 -and (Get-Command Get-VBRSessionLog -ErrorAction SilentlyContinue)) {
    try {
      $log = Get-VBRSessionLog -Session $Session
      foreach ($entry in $log) {
        $lstatus = "$($entry.Status)"
        if ($lstatus -notmatch '(?i)warning|failed|error') { continue }
        $title = "$($entry.Title)".Trim()
        $desc  = "$($entry.Description)".Trim()
        if ($title -and $desc -and ($desc -ne $title)) { Add-Msg "$title | $desc" }
        elseif ($title) { Add-Msg $title }
        elseif ($desc)  { Add-Msg $desc }
      }
    } catch { }
  }

  # 5. Session-Level-Properties (letzter Ausweg)
  if ($msgs.Count -eq 0) {
    foreach ($pc in @('Info.Reason','Info.FailureMessage','Info.Description','Reason','FailureMessage','Description')) {
      $v = Get-NestedProperty $Session $pc
      if ($v) {
        Add-Msg "$v"
        if ($DebugVerbose) { Write-Host ("    [dbg] session.{0} = {1}" -f $pc, $v) }
        break
      }
    }
  }

  # 6. Deep-Debug wenn immer noch nichts gefunden wurde - dumpt alle Session-Props
  if ($msgs.Count -eq 0 -and $DebugVerbose) {
    Write-Host '    [dbg] *** deep dump, alle nicht-leeren Session-Properties:'
    try {
      $Session | Get-Member -MemberType Properties -ErrorAction SilentlyContinue | ForEach-Object {
        $n = $_.Name
        try {
          $v = $Session.$n
          if ($null -ne $v) {
            $vs = "$v"
            if ($vs.Length -gt 0 -and $vs.Length -lt 200 -and $vs -notmatch '^\s*$') {
              Write-Host ("      session.{0} = {1}" -f $n, $vs)
            }
          }
        } catch {}
      }
    } catch {}
    Write-Host '    [dbg] no note text found in any source'
    return $null
  }

  if ($msgs.Count -eq 0) { return $null }

  $text = (($msgs | Select-Object -Unique) -join ' | ')
  $text = ($text -replace '\s+', ' ').Trim()
  if ($text.Length -gt 500) { $text = $text.Substring(0, 497) + '...' }
  return $text
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

# Sessions ohne verwendbaren Namen filtern (weder JobName noch Name gesetzt)
$beforeName = @($sessions).Count
$sessions = $sessions | Where-Object { Get-NormalizedJobName $_ }
$droppedNoName = $beforeName - @($sessions).Count
if ($droppedNoName -gt 0) {
  Write-Info "Skipping $droppedNoName session(s) without JobName/Name"
}

# Backup-Copy-Child-Sessions rausfiltern (Format: "CopyPolicy\VmName")
if (-not $IncludeCopyJobs) {
  $before = @($sessions).Count
  $sessions = $sessions | Where-Object { (Get-NormalizedJobName $_) -notmatch '\\' }
  $filteredOut = $before - @($sessions).Count
  if ($filteredOut -gt 0) {
    Write-Info "Skipping $filteredOut backup-copy child sessions (use -IncludeCopyJobs to include)"
  }
}

if (-not $sessions) {
  Write-Info 'Nothing left after filtering. Exiting.'
  exit 0
}

# pro JobName letzten Lauf (Gruppierung ueber die normalisierte Form)
$latestPerJob = $sessions |
  Group-Object -Property { Get-NormalizedJobName $_ } |
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
  $jobName = Get-NormalizedJobName $s
  $status  = Get-StatusFromResult $s.Result
  $note    = $null
  if ($status -ne 'success') {
    if ($DryRun) {
      Write-Host ("  [note] probing '{0}' (status={1})..." -f $jobName, $status)
    }
    $note = Get-SessionNote -Session $s -DebugVerbose:$DryRun
    if ($DryRun) {
      if ($note) { Write-Host ("  [note] -> `"$note`"") }
      else       { Write-Host '  [note] -> (nichts gefunden)' }
    }
  }

  [pscustomobject]@{
    job    = $jobName
    status = $status
    note   = $note
  }
}

# Kurzuebersicht ueber gefundene Notizen
$withNote = ($results | Where-Object { $_.note }).Count
if ($withNote -gt 0) {
  Write-Info "Fehlermeldungen extrahiert: $withNote"
  if ($DryRun) {
    foreach ($r in ($results | Where-Object { $_.note })) {
      Write-Host ("  [{0}] {1}: {2}" -f $r.status, $r.job, $r.note)
    }
  }
}

# Uebersicht ueber die tatsaechliche Verteilung
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
  Write-Info 'Dry run - payload:'
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
