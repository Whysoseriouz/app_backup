# Backup Check

Matrix-basiertes Quittier-Tool für tägliche Veeam-Backup-Jobs. Für jeden Job
wird pro Tag der Status (Erfolg / Warnung / Fehler) manuell bestätigt.
Enthält Wochen- und Monatsansicht, Ein-Klick-Bestätigung für den ganzen Tag,
Job-Verwaltung und einen druckbaren Monatsbericht.

Die Datumsspalten stehen für den **Sicherungstag**: Ein Lauf von Montagabend
bis Dienstagmorgen wird unter Montag geführt. Der tatsächliche Kontroll- oder
Importzeitpunkt wird separat als `confirmed_at` gespeichert und angezeigt.

## Schnellstart (Docker)

```bash
docker compose up -d --build
```

Die App läuft dann auf `http://<host>:3000`. Die SQLite-Datenbank liegt in
`./data/backup.db` und bleibt über Container-Neustarts hinweg erhalten.

Beim ersten Start werden die Jobs aus dem Screenshot automatisch angelegt.

## Lokale Entwicklung

```bash
npm install
npm run dev
```

## Umgebungsvariablen

| Variable        | Default                    | Zweck                             |
| --------------- | -------------------------- | --------------------------------- |
| `DATABASE_PATH` | `./data/backup.db`         | Pfad zur SQLite-Datei             |
| `PORT`          | `3000`                     | HTTP-Port                         |
| `SYNC_TOKEN`    | —                          | Bearer-Token für den Veeam-Sync   |

## Routen

- `/` &nbsp;– Matrix-Dashboard (Woche / Monat)
- `/jobs` &nbsp;– Jobs anlegen, umbenennen, deaktivieren
- `/report` &nbsp;– Druckbarer Monatsbericht (Strg+P → PDF speichern)

## Veeam-Sync (optional)

Ein PowerShell-Skript auf dem Veeam-Host pusht die nächtlichen
Job-Ergebnisse morgens automatisch in die App. Der Endpoint ist
`POST /api/sync` (Bearer-Token via Env-Var `SYNC_TOKEN`).

Der Sync läuft mit **PowerShell 7** (`pwsh.exe`). Standardmäßig wird der
Vortag als Sicherungstag übertragen. Wenn Veeam einen fehlgeschlagenen Lauf
automatisch wiederholt, zählt pro Job die zuletzt abgeschlossene Session. So
wird beispielsweise ein fehlgeschlagener Erstlauf mit erfolgreicher oder
warnender Wiederholung nicht fälschlich als endgültiger Fehler eingetragen.

Setup-Anleitung: [scripts/README.md](scripts/README.md)

Manuelle Quittungen werden beim Sync nie überschrieben — sobald du eine
Zelle selber angefasst hast, gehört sie dir.

## Bestehende Installationen umstellen

Installationen, die das Kontrolldatum bisher als Sicherungsdatum verwendet
haben, können einmalig mit `scripts/migrate-confirmation-dates.mjs` umgestellt
werden. Das Werkzeug verschiebt automatische und manuelle Quittierungen einen
Kalendertag zurück, erstellt vorher eine Datenbanksicherung und verhindert
eine versehentliche zweite Ausführung. Der genaue Docker-Ablauf ist in der
[Veeam-Sync-Anleitung](scripts/README.md#bestehende-daten-einmalig-migrieren)
beschrieben.
