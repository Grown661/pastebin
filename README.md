# pastebin

Self-hosted Snippet-Host mit Syntax-Highlight und Ablaufdatum — komplett ohne
Dependencies.

## Problem

Code-Schnipsel schnell teilen, ohne sie einem fremden Dienst zu geben — und
ohne dass sie ewig liegen bleiben. Dieser Pastebin laeuft lokal oder auf dem
eigenen Server, Pastes koennen automatisch ablaufen.

## Features

- Pastes erstellen mit Sprache (JS / Python / Text) und Ablauf (nie / 1h / 1d / 1w)
- Eigener Mini-Syntax-Highlighter (tokenbasiert, ~100 Zeilen, keine Library)
- Raw-View fuer `curl` / Download
- Abgelaufene Pastes werden beim Zugriff automatisch geloescht
- IDs aus `node:crypto`, Persistenz als JSON-Datei
- Groessenlimit 256 KB pro Paste

## Stack

- **Backend:** Node.js, nur Builtins (`node:http`, `node:crypto`, `node:fs`)
- **Frontend:** Vanilla JS, eine `index.html` + eigener Highlighter
- **Persistenz:** JSON-File unter `data/`

Keine Dependencies, kein `npm install`.

## Setup & Start

```bash
node server.js
```

Danach im Browser: <http://localhost:8211>

Port aendern: `PORT=8300 node server.js`

## API

| Methode | Pfad         | Beschreibung                                              |
|---------|--------------|-----------------------------------------------------------|
| POST    | `/api/paste` | `{content, language, expiresIn}` → `{id, url, rawUrl}`    |
| GET     | `/:id`       | HTML-Ansicht mit Syntax-Highlight                          |
| GET     | `/raw/:id`   | Snippet als `text/plain`                                   |

`language`: `js` \| `py` \| `generic` — `expiresIn`: `never` \| `1h` \| `1d` \| `1w`

## Screenshot

_(Screenshot folgt)_

## Lizenz

MIT
