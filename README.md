# Backup Check

Matrix-basiertes Quittier-Tool für tägliche Veeam-Backup-Jobs. Für jeden Job
wird pro Tag der Status (Erfolg / Warnung / Fehler) manuell bestätigt.
Enthält Wochen- und Monatsansicht, Ein-Klick-Bestätigung für den ganzen Tag,
Job-Verwaltung und einen druckbaren Monatsbericht.

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

## Routen

- `/` &nbsp;– Matrix-Dashboard (Woche / Monat)
- `/jobs` &nbsp;– Jobs anlegen, umbenennen, deaktivieren
- `/report` &nbsp;– Druckbarer Monatsbericht (Strg+P → PDF speichern)

## Veeam-Sync (optional)

Ein PowerShell-Skript auf dem Veeam-Host pusht die nächtlichen
Job-Ergebnisse morgens automatisch in die App. Der Endpoint ist
`POST /api/sync` (Bearer-Token via Env-Var `SYNC_TOKEN`).

Setup-Anleitung: [scripts/README.md](scripts/README.md)

Manuelle Quittungen werden beim Sync nie überschrieben — sobald du eine
Zelle selber angefasst hast, gehört sie dir.
