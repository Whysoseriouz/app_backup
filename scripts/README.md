# Veeam-Sync einrichten

Dieses Skript läuft auf dem **Veeam-B&R-Host** und pusht die letzten Session-Ergebnisse einmal täglich an Backup Check.

## Voraussetzungen

- Veeam Backup & Replication ≥ 11 mit installiertem PowerShell-Modul (`Veeam.Backup.PowerShell`) oder dem älteren Snapin `VeeamPSSnapin`.
- Windows PowerShell 5.1 oder PowerShell 7.
- Netzwerkzugriff vom Veeam-Host auf den Backup-Check-Server (Port 3000 TCP).

## 1. Token auf der App-Seite setzen

Neben der `docker-compose.yml` eine Datei `.env` anlegen:

```env
SYNC_TOKEN=f8a5e9c1-...-generiere-mich
```

Einen Token-String erzeugen:

```powershell
[guid]::NewGuid().Guid
```

Danach Stack neu starten, damit der Token in den Container kommt:

```bash
docker compose up -d
```

Der Sync-Endpoint `/api/sync` ist erst mit gesetztem Token aktiv; ohne Token gibt er 503 zurück.

## Datumslogik

Das an die App gesendete Datum ist der **Sicherungstag**, nicht der Tag der
Kontrolle. Startet ein Lauf Montagabend und endet Dienstagmorgen, wird er unter
Montag verbucht. Der tatsächliche Import-/Kontrollzeitpunkt wird von der App
separat als `confirmed_at` gespeichert.

Beim regulären morgendlichen Lauf verwendet das Skript deshalb standardmäßig
den Vortag. Für Nachbuchungen oder einen abweichenden Sicherungstag kann das
Datum ausdrücklich gesetzt werden:

```powershell
.\sync-veeam.ps1 -TargetDate 2026-04-20 -LookbackHours 72
```

### Bestehende Daten einmalig migrieren

Wenn alte automatische und manuelle Quittierungen noch unter dem Pruefdatum
gespeichert sind, koennen sie mit dem Migrationswerkzeug gemeinsam einen Tag
zurueckgesetzt werden. Zuerst immer die Vorschau ausfuehren:

```bash
node scripts/migrate-confirmation-dates.mjs \
  --db data/backup.db \
  --through 2026-07-21
```

`--through` ist der letzte Tag, der noch nach der alten Datumslogik gespeichert
wurde. Fuer die Ausfuehrung muss die App gestoppt sein:

```bash
node scripts/migrate-confirmation-dates.mjs \
  --db data/backup.db \
  --through 2026-07-21 \
  --apply --app-stopped
```

Das Werkzeug legt vor jeder Aenderung automatisch eine SQLite-Sicherungsdatei
an, verschiebt alle passenden Quittierungen in einer Transaktion, prueft danach
die Datenbankintegritaet und verhindert eine versehentliche zweite Ausfuehrung.
`confirmed_at`, Status, Notizen und Benutzer bleiben unveraendert.

Bei der Docker-Installation kann das Werkzeug aus dem neuen Image ausgefuehrt
werden. Waehrend des Cutovers darf weder der alte noch der neue Veeam-Task
weitere Daten senden:

```bash
docker compose build backup-check
docker compose stop backup-check

# Vorschau; Stichtag an den letzten Lauf mit alter Datumslogik anpassen
docker compose run --rm --no-deps backup-check \
  node scripts/migrate-confirmation-dates.mjs \
  --db /app/data/backup.db --through 2026-07-21

# Erst nach kontrollierter Vorschau ausfuehren
docker compose run --rm --no-deps backup-check \
  node scripts/migrate-confirmation-dates.mjs \
  --db /app/data/backup.db --through 2026-07-21 \
  --apply --app-stopped

docker compose up -d backup-check
```

Danach muss auf dem Veeam-Host die neue Version von `sync-veeam.ps1` aktiv sein,
bevor der geplante morgendliche Lauf wieder eingeschaltet wird.

## 2. Skript auf den Veeam-Host kopieren

Kopiere `sync-veeam.ps1` z. B. nach `C:\Scripts\BackupCheck\sync-veeam.ps1`.

## 3. Umgebungsvariablen auf dem Veeam-Host setzen

Einmalig, systemweit (als Administrator):

```powershell
[Environment]::SetEnvironmentVariable('BACKUP_CHECK_URL',
  'http://backup-check.lan:3000/api/sync', 'Machine')

[Environment]::SetEnvironmentVariable('BACKUP_CHECK_TOKEN',
  'f8a5e9c1-...-derselbe-wert-wie-in-.env', 'Machine')
```

Der Hostname/IP muss auf den Docker-Host zeigen, auf dem Backup Check läuft.

## 4. Trockenlauf

```powershell
cd C:\Scripts\BackupCheck
.\sync-veeam.ps1 -DryRun
```

Zeigt das JSON, das an die API gesendet würde — ohne Netzwerkaufruf. So siehst du direkt, welche Jobs mit welchem Status erfasst würden. Falls Job-Namen zwischen Veeam und Backup Check abweichen, hier korrigieren (entweder in Veeam umbenennen oder in der App unter `/jobs`).

## 5. Einmal live ausführen

```powershell
.\sync-veeam.ps1
```

Erwartete Ausgabe (Beispiel):

```
[Backup-Check] Backup date   : 2026-04-21
[Backup-Check] Sync/check at : 04/22/2026 07:00:00
[Backup-Check] Lookback      : 04/21/2026 13:00:00  ->  04/22/2026 07:00:00
[Backup-Check] Sessions found: 42 total, 39 unique jobs
[Backup-Check] Sending 39 results to http://backup-check.lan:3000/api/sync
[Backup-Check] Inserted:       38
[Backup-Check] Updated:        0
[Backup-Check] Skipped manual: 1
```

In der Web-Oberfläche siehst du dann die Zellen automatisch vorbefüllt, und im Zellen-Tooltip steht „von Veeam-Sync".

## 6. Task Scheduler einrichten

Per PowerShell (als Administrator):

```powershell
$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\Scripts\BackupCheck\sync-veeam.ps1'

$trigger = New-ScheduledTaskTrigger -Daily -At 07:00

$principal = New-ScheduledTaskPrincipal `
  -UserId 'NT AUTHORITY\SYSTEM' `
  -LogonType ServiceAccount `
  -RunLevel Highest

Register-ScheduledTask `
  -TaskName  'Backup-Check Veeam Sync' `
  -Action    $action `
  -Trigger   $trigger `
  -Principal $principal `
  -Description 'Pushes last night''s Veeam job results to Backup Check.'
```

Laufzeit 07:00 Uhr passt für Backups, die typischerweise zwischen 18 Uhr und 05 Uhr laufen — der Lookback von 18 h deckt das ab.

## Troubleshooting

- **`No token` beim Skript-Start** → `BACKUP_CHECK_TOKEN` auf dem Veeam-Host nicht gesetzt (neue PowerShell-Session nach `SetEnvironmentVariable` öffnen, Scheduled Task läuft eh mit frischem Environment).
- **HTTP 401** → Token im Skript stimmt nicht mit `SYNC_TOKEN` im Container überein. App neu starten nach `.env`-Änderung.
- **HTTP 503** → Container wurde gestartet ohne gesetzten `SYNC_TOKEN`. `docker compose up -d` nach `.env`-Anpassung neu starten.
- **`unknown_jobs` in der Antwort** → Job-Name in Veeam weicht vom Namen in der App ab. Namen unter `/jobs` anpassen oder Veeam-Job umbenennen.
- **`Skipped manual: N`** → ist gewollt: du hattest schon manuell quittiert, deine Notiz bleibt erhalten.

## Manuell nachquittieren

Wenn du nach dem Sync eine Zelle anklickst und etwas änderst (z. B. Notiz hinzufügst oder Status korrigierst), wird die Quittung ab dann dir zugeordnet — das Skript überschreibt sie bei zukünftigen Läufen **nicht** mehr, solange du sie nicht über das Zurücksetzen-Icon auf der Zelle oder im Tages-Header löschst.
