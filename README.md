# 🧠 NewsAI — Daily AI Intelligence Report Generator

> **Architettura completa per la generazione automatica di report di intelligence basati su ricerche web reali.**
> 
> Progettato per essere **riutilizzabile** con qualsiasi dominio di ricerca — non solo AI.

---

## 📋 Sommario

- [Panoramica del Progetto](#panoramica-del-progetto)
- [Come Funziona — Il Pipeline](#come-funziona--il-pipeline)
- [Architettura dei File](#architettura-dei-file)
- [Workflow di Esecuzione](#workflow-di-esecuzione)
- [Setup Iniziale](#setup-iniziale)
- [Esecuzione Locale](#esecuzione-locale)
- [GitHub Actions (Cloud)](#github-actions-cloud)
- [Come Adattare per Altri Tipi di Ricerca](#come-adattare-per-altri-tipi-di-ricerca)
- [Configurazione di Riferimento](#configurazione-di-riferimento)
- [Risoluzione Problemi](#risoluzione-problemi)

---

## Panoramica del Progetto

NewsAI è un sistema automatizzato che ogni giorno alle **7:00 AM CET**:

1. **Interroga il web** tramite [Brave Search API](https://brave.com/search/api/) cercando notizie, benchmark, rilasci e aggiornamenti sui modelli AI specificati
2. **Genera un report HTML** formattato professionalmente, con titoli, elenchi puntati, link alle fonti originali e tabelle comparative
3. **Invia il report via email** con il corpo HTML completo (+ PDF come attachment opzionale)
4. **Espone il report** su un server web locale (`http://localhost:3000`)

Il sistema ha **doppia ridondanza**:
- **Mac locale**: tramite `launchd` (cron job macOS nativo)
- **Cloud**: tramite GitHub Actions (workflow schedulato)

### Target di Ricerca Attuali

| Sezione | Target Monitorati |
|---------|-------------------|
| DeepSeek | DeepSeek V4 Pro, V4 Flash |
| Kimi | Kimi K2.6 (Moonshot AI) |
| Qwen | Qwen 3.7 Max, Qwen3.5 (Alibaba) |
| Claude | Claude Opus 4.8, Sonnet 4.6 (Anthropic) |
| Gemini | Gemini 3.5 Flash/Pro (Google) |
| Panoramica Globale | OpenAI, Meta Llama, Mistral, startup emergenti |

---

## Come Funziona — Il Pipeline

```
┌─────────────────────────────────────────────────────────┐
│                   TRIGGER (7:00 AM)                      │
│                                                          │
│  macOS launchd  ────>  daily-job.js                      │
│  GitHub Actions  ────>  workflow dispatch                │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 1: generate-report.js                              │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Per ogni target (6 sezioni):                     │    │
│  │                                                   │    │
│  │  1. Esegue 2-3 query su Brave Search API         │    │
│  │  2. Raccoglie risultati (titolo, descrizione,    │    │
│  │     URL, età, fonte)                             │    │
│  │  3. Deduplica per URL                            │    │
│  │  4. Filtra per data (ultime 24 ore / 7 giorni)   │    │
│  │  5. Costruisce HTML con sezioni e link           │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Output: reports/report-ai.html                          │
│          reports/report-ai-YYYY-MM-DD.html (copia)       │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  STEP 2: send-email.js                                   │
│                                                          │
│  1. Legge il report HTML                                 │
│  2. (Opzionale) Converte in PDF via Puppeteer            │
│  3. Invia email con HTML inline + PDF attachment         │
│  4. Se il PDF fallisce, invia comunque solo HTML         │
│                                                          │
│  SMTP: Gmail (con App Password)                          │
└──────────────────────────────────────────────────────────┘
```

---

## Architettura dei File

```
NewsAI/
├── .github/
│   └── workflows/
│       └── daily-report.yml      # GitHub Actions: esecuzione cloud alle 7:00 CET
├── .gitignore                     # Esclude node_modules, config.json, reports, logs
├── README.md                      # Questo documento
├── package.json                   # Dipendenze e script npm
├── package-lock.json              # Lock file per npm ci (GitHub Actions)
│
├── config.json                    # ⚠️ LOCALE (non committato) — API key, SMTP, targets
│
├── generate-report.js             # CORE: ricerca web + generazione HTML
├── send-email.js                  # Invio email con HTML + PDF
├── server.js                      # Server web Express (porta 3000)
├── daily-job.js                   # Runner che orchestra generate + send
├── setup-cron.js                  # Installa/rimuove il cron job macOS (launchd)
│
├── reports/
│   ├── report-ai.html             # Ultimo report generato
│   └── report-ai-YYYY-MM-DD.html  # Copie datate
└── logs/
    ├── daily-job.log              # Log del runner giornaliero
    ├── stdout.log                 # stdout del processo launchd
    └── stderr.log                 # stderr del processo launchd
```

### Dettaglio dei File

#### `generate-report.js` — Il Cuore del Sistema (619 righe)

Questo è il componente principale. Può funzionare in due modalità:

- **Modalità cloud** (GitHub Actions): legge `BRAVE_API_KEY` da variabile d'ambiente, usa target hardcoded
- **Modalità locale**: legge tutto da `config.json`

**Funzioni chiave:**
| Funzione | Ruolo |
|----------|-------|
| `braveSearch(query)` | Chiamata HTTP a Brave Search API con decompressione gzip |
| `extractResults(apiResponse)` | Estrae e pulisce i risultati (titolo, descrizione, URL, fonte, età) |
| `extractSourceName(url)` | Mappa 50+ domini a nomi leggibili (Reuters, Hugging Face, ecc.) |
| `deduplicate(results)` | Rimuove duplicati per URL |
| `isRecentEnough(result)` | Filtra per data (ore/giorni ≤ 7 giorni) |
| `searchTarget(targetKey)` | Orchestra 2-3 query per target, con delay anti-rate-limit |
| `renderSection(name, results)` | Produce HTML di una sezione con `<ul>` e link |
| `renderDataTable(title, rows)` | Produce tabella HTML comparativa |
| `buildHtml(dateStr, sections, dataTables)` | Assembla il documento HTML completo |

**Safety guard:** Se 0 risultati totali e esiste un report precedente valido (>5KB), non sovrascrive.

#### `send-email.js` — Invio Email (224 righe)

- Rileva automaticamente modalità cloud (env vars) vs locale (config.json)
- Converte HTML in PDF via Puppeteer (headless Chromium)
- Fallback graceful: se PDF fallisce, invia solo HTML
- Supporta flag CLI: `--to email@test.it`, `--no-pdf`

#### `server.js` — Server Web (65 righe)

- Express sulla porta configurata (default 3000)
- Serve `reports/report-ai.html` alla root `/`
- Endpoint API: `GET /api/latest` restituisce JSON con metadati

#### `daily-job.js` — Runner Giornaliero (100 righe)

- Esegue `generate-report.js` → `send-email.js` in sequenza
- Logga su `logs/daily-job.log` con timestamp
- Supporta `--dry` per test senza invio email
- Timeout di 2 minuti per step, buffer 10MB

#### `setup-cron.js` — Cron Job macOS (155 righe)

- Crea un file `.plist` in `~/Library/LaunchAgents/`
- Usa `launchd` (nativo macOS) per esecuzione alle 7:00 ogni giorno
- Comandi: installa, `--remove`, `--status`

#### `.github/workflows/daily-report.yml` — CI/CD Cloud (53 righe)

- Trigger: `cron: "0 5 * * *"` (5:00 UTC = 7:00 CET) + `workflow_dispatch` (manuale)
- Ubuntu latest, Node.js 22
- Installa Chromium per Puppeteer (PDF)
- Tutti i secret letti da GitHub Secrets
- Upload artifact HTML per 7 giorni

---

## Workflow di Esecuzione

### Diagramma di Flusso Completo

```
                    ┌──────────────────┐
                    │   Ore 7:00 CET   │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌──────────────────┐          ┌──────────────────┐
    │  macOS launchd   │          │  GitHub Actions  │
    │  (setup-cron.js) │          │  (daily-report   │
    │                  │          │   .yml)          │
    └────────┬─────────┘          └────────┬─────────┘
             │                             │
             └──────────┬──────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   daily-job.js   │
              │   (orchestrator)  │
              └────────┬─────────┘
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
    ┌──────────────┐  ┌──────────────────┐
    │ generate-    │  │ send-email.js    │
    │ report.js    │  │                  │
    │              │  │ HTML body +      │
    │ 12-15 query  │  │ PDF attachment   │
    │ a Brave API  │  │                  │
    │              │  │ → boroccirenato  │
    │ → report     │  │   @gmail.com     │
    │   .html      │  └──────────────────┘
    └──────────────┘
```

---

## Setup Iniziale

### Prerequisiti

- **Node.js** ≥ 18.0.0
- **npm** (incluso con Node.js)
- **Brave Search API key** (gratuita: [brave.com/search/api/](https://brave.com/search/api/))
- **Account Gmail** con App Password (per SMTP)
- **Git** (per il deploy su GitHub)
- **(Opzionale) GitHub CLI** (`gh`) per automatizzare i secret

### 1. Clona e installa

```bash
git clone https://github.com/RenatoNoxex/NewsAI.git
cd NewsAI
npm install
```

### 2. Crea `config.json`

```json
{
  "braveSearch": {
    "apiKey": "LA_TUA_BRAVE_API_KEY",
    "baseUrl": "https://api.search.brave.com/res/v1/web/search",
    "maxResultsPerQuery": 10
  },
  "report": {
    "outputDir": "./reports",
    "outputFile": "report-ai.html"
  },
  "email": {
    "enabled": true,
    "from": "tuo@gmail.com",
    "to": "destinatario@email.it",
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "secure": false,
      "user": "tuo@gmail.com",
      "pass": "tua-app-password-gmail"
    }
  },
  "webServer": {
    "enabled": true,
    "port": 3000
  },
  "targets": {
    ... (vedi sezione Configurazione di Riferimento)
  }
}
```

### 3. Ottieni una Brave Search API Key

1. Vai su [brave.com/search/api/](https://brave.com/search/api/)
2. Clicca "Get Started for Free"
3. Piano Free: 2,000 query/mese (sufficiente per ~30 report da 15 query)
4. Copia la chiave nel campo `braveSearch.apiKey` di `config.json`

### 4. Configura Gmail SMTP

1. Attiva la **verifica in due passaggi** sul tuo account Google
2. Vai su [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Genera una "Password per app" (seleziona "Posta" e "Altro")
4. Usa quella password nel campo `email.smtp.pass`

### 5. Testa il sistema

```bash
# Testa solo la generazione del report
npm run generate

# Verifica il report nel browser
open reports/report-ai.html

# Testa l'invio email
npm run send-email

# Avvia il server web
npm run serve
# Poi apri http://localhost:3000
```

### 6. Attiva il cron job automatico (macOS)

```bash
# Installa il job giornaliero alle 7:00
npm run setup-cron

# Verifica lo stato
node setup-cron.js --status

# Per rimuoverlo
npm run remove-cron
```

---

## Esecuzione Locale

### Comandi NPM

| Comando | Descrizione |
|---------|-------------|
| `npm run generate` | Genera il report HTML (ricerca sul web) |
| `npm run send-email` | Invia il report via email |
| `npm run daily-job` | Esegue generate + send email |
| `npm run daily-job:dry` | Esegue solo generate (test senza invio) |
| `npm run serve` | Avvia server web su `http://localhost:3000` |
| `npm run setup-cron` | Installa il cron job macOS (7:00 AM) |
| `npm run remove-cron` | Rimuove il cron job macOS |

### Test Manuali

```bash
# Forza rigenerazione ignorando cache
node generate-report.js --now

# Invia a un destinatario specifico
node send-email.js --to altro@email.it

# Invia senza PDF (più veloce per test)
node send-email.js --no-pdf

# Esecuzione completa con log
node daily-job.js
```

---

## GitHub Actions (Cloud)

Il workflow GitHub Actions fornisce ridondanza cloud: se il Mac è spento, il report viene comunque generato e inviato.

### Secrets Configurati

| Secret | Valore |
|--------|--------|
| `BRAVE_API_KEY` | API key Brave Search |
| `EMAIL_FROM` | Mittente email |
| `EMAIL_TO` | Destinatario email |
| `SMTP_HOST` | Host SMTP (es. `smtp.gmail.com`) |
| `SMTP_PORT` | Porta SMTP (es. `587`) |
| `SMTP_USER` | Username SMTP |
| `SMTP_PASS` | Password SMTP (App Password) |

### Configurare i Secrets

```bash
# Con GitHub CLI
gh secret set BRAVE_API_KEY --body "BSA..."
gh secret set EMAIL_FROM --body "tuo@gmail.com"
gh secret set EMAIL_TO --body "dest@email.it"
gh secret set SMTP_HOST --body "smtp.gmail.com"
gh secret set SMTP_PORT --body "587"
gh secret set SMTP_USER --body "tuo@gmail.com"
gh secret set SMTP_PASS --body "app-password"
```

Oppure manualmente: **Repository → Settings → Secrets and variables → Actions → New repository secret**

### Test del Workflow

1. Vai alla tab **Actions** del repository
2. Seleziona **"Daily AI Report (7:00 AM CET)"**
3. Clicca **"Run workflow"** → **"Run workflow"**

### Schedule

Il workflow gira alle **5:00 UTC** ogni giorno, che corrisponde alle **7:00 CET** (ora italiana).

---

## Come Adattare per Altri Tipi di Ricerca

Questo sistema è stato progettato per essere **generico e riutilizzabile**. Ecco come adattarlo a qualsiasi dominio di ricerca:

### Approccio Generale

Il cuore del sistema è la configurazione `targets` in `config.json`. Ogni target ha:
- **name**: nome visualizzato nel report
- **queries**: array di stringhe di ricerca (2-3 per target)
- **aliases** (opzionale): nomi alternativi per il filtro

### Esempio 1: Cybersecurity Threat Intelligence

```json
{
  "targets": {
    "ransomware": {
      "name": "Ransomware Groups",
      "queries": [
        "ransomware attack news today 2026",
        "new ransomware group discovered 2026",
        "ransomware negotiation data leak 2026"
      ]
    },
    "zeroday": {
      "name": "Zero-Day Vulnerabilities",
      "queries": [
        "zero-day vulnerability disclosed today 2026",
        "CVE critical patch tuesday June 2026",
        "zero-day exploit in the wild 2026"
      ]
    },
    "apt": {
      "name": "APT & Nation-State Actors",
      "queries": [
        "APT group activity report June 2026",
        "nation-state cyber attack news 2026",
        "advanced persistent threat campaign 2026"
      ]
    },
    "panoramic": {
      "name": "Panoramica Cybersecurity",
      "queries": [
        "cybersecurity news today June 2026",
        "data breach disclosed 2026",
        "infosec threat intelligence report 2026"
      ]
    }
  }
}
```

### Esempio 2: Mercati Finanziari

```json
{
  "targets": {
    "crypto": {
      "name": "Crypto & Blockchain",
      "queries": [
        "Bitcoin ETF flow update June 2026",
        "Ethereum L2 scaling news 2026",
        "DeFi protocol launch June 2026"
      ]
    },
    "stocks": {
      "name": "Mercati Azionari",
      "queries": [
        "S&P 500 NASDAQ record high June 2026",
        "earnings report surprise Q2 2026",
        "Fed interest rate decision June 2026"
      ]
    },
    "panoramic": {
      "name": "Panoramica Mercati",
      "queries": [
        "global markets news today June 2026",
        "economic indicators released 2026",
        "market analysis outlook June 2026"
      ]
    }
  }
}
```

### Esempio 3: Ricerca Scientifica

```json
{
  "targets": {
    "crispr": {
      "name": "CRISPR & Gene Editing",
      "queries": [
        "CRISPR clinical trial results June 2026",
        "gene editing breakthrough 2026",
        "FDA approval gene therapy 2026"
      ]
    },
    "fusion": {
      "name": "Nuclear Fusion",
      "queries": [
        "nuclear fusion breakthrough 2026",
        "ITER project update June 2026",
        "fusion energy milestone achieved 2026"
      ]
    },
    "panoramic": {
      "name": "Panoramica Scientifica",
      "queries": [
        "scientific breakthrough Nature Science June 2026",
        "major research paper published today 2026",
        "Nobel-worthy discovery 2026"
      ]
    }
  }
}
```

### Passaggi per Adattare

1. **Modifica `targets` in `config.json`** — cambia nomi, query e alias
2. **Aggiorna la tabella prezzi** in `generate-report.js` (righe 520-562) o rimuovila
3. **Aggiorna `getDefaultTargets()`** in `generate-report.js` (righe 54-100) per il fallback cloud
4. **Personalizza titoli e stili** — modifica i tag `<h1>` e `<h2>` in `buildHtml()` (righe 411-472)
5. **Aggiungi fonti** a `extractSourceName()` (righe 213-276) per i domini del tuo settore
6. **Testa** con `npm run generate` e verifica il risultato
7. **(Opzionale) Cambia nome repository** e aggiorna i riferimenti nel codice

### Consigli per Query Efficaci

- Usa **date specifiche** nelle query (es. "June 5 2026") — il sistema non le aggiorna automaticamente, ma puoi usare `new Date()` in `getDefaultTargets()`
- Limita a **2-3 query per target** per restare nel tier gratuito Brave (2,000/mese)
- Usa **parole chiave precise**: "release", "benchmark", "update", "announcement", "launch"
- Evita query troppo generiche che producono rumore
- Aggiungi l'anno corrente per risultati più pertinenti

---

## Configurazione di Riferimento

### `config.json` — Struttura Completa

```jsonc
{
  "report": {
    "outputDir": "./reports",          // Directory output
    "outputFile": "report-ai.html",    // Nome file principale
    "dateFormat": "DD/MM/YYYY",        // Formato data nel report
    "cssStyle": "google-docs",         // Stile CSS (google-docs, minimal, modern)
    "timezone": "Europe/Rome"          // Timezone per i timestamp
  },
  "braveSearch": {
    "apiKey": "BSA...",                // API key Brave Search
    "baseUrl": "https://api.search.brave.com/res/v1/web/search",
    "maxResultsPerQuery": 10           // Risultati per query (max 20)
  },
  "email": {
    "enabled": true,                   // Attiva/disattiva invio email
    "from": "mittente@gmail.com",
    "to": "destinatario@email.it",
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "secure": false,                 // true per porta 465, false per 587
      "user": "mittente@gmail.com",
      "pass": "app-password"
    }
  },
  "webServer": {
    "enabled": true,
    "port": 3000
  },
  "cron": {
    "schedule": "0 7 * * *",          // Ogni giorno alle 7:00
    "description": "Every day at 7:00 AM"
  },
  "targets": {
    "targetKey": {
      "name": "Nome Visualizzato",
      "aliases": ["alias1", "alias2"], // Nomi alternativi (opzionale)
      "queries": [
        "query di ricerca 1",
        "query di ricerca 2"
      ]
    }
  }
}
```

### Variabili d'Ambiente (Modalità Cloud)

In GitHub Actions, invece di `config.json`, si usano variabili d'ambiente:

| Variabile | Equivalente in config.json |
|-----------|---------------------------|
| `BRAVE_API_KEY` | `braveSearch.apiKey` |
| `EMAIL_FROM` | `email.from` |
| `EMAIL_TO` | `email.to` |
| `SMTP_HOST` | `email.smtp.host` |
| `SMTP_PORT` | `email.smtp.port` |
| `SMTP_USER` | `email.smtp.user` |
| `SMTP_PASS` | `email.smtp.pass` |

Il codice rileva automaticamente la modalità: se `BRAVE_API_KEY` o `SMTP_HOST` sono presenti come variabili d'ambiente, usa la modalità cloud.

---

## Risoluzione Problemi

### "The provided subscription token is invalid"

- Verifica che la API key in `config.json` o `BRAVE_API_KEY` env var sia corretta
- Ottieni una nuova key su [brave.com/search/api/](https://brave.com/search/api/)
- La key free ha limite di 2,000 query/mese — controlla di non averlo superato

### "0 results obtained" su tutte le query

- **Causa probabile**: API key non valida o scaduta
- Verifica con: `curl -s --compressed -H "Accept: application/json" -H "X-Subscription-Token: TUA_KEY" "https://api.search.brave.com/res/v1/web/search?q=test&count=1"`
- Il sistema ha una **safety guard**: se 0 risultati e il report precedente è valido, non lo sovrascrive

### "PDF generation failed: Navigation timeout"

- Puppeteer ha raggiunto il timeout di 30 secondi per il rendering
- L'email viene comunque inviata con il corpo HTML (senza PDF)
- Su GitHub Actions, assicurati che lo step "Install Chromium" sia eseguito
- Per test locale: `node send-email.js --no-pdf`

### "Email sent successfully" ma non arriva

- Controlla la cartella **Spam** del destinatario
- Aggiungi il mittente alla rubrica per migliorare la deliverability
- Verifica che la App Password Gmail sia corretta
- Prova con `node send-email.js --to tuo@email.it` per test

### Cron job non eseguito

```bash
# Verifica lo stato
node setup-cron.js --status

# Controlla i log
cat logs/daily-job.log
cat logs/stderr.log

# Reinstalla
node setup-cron.js --remove
node setup-cron.js

# Forza esecuzione immediata per test
launchctl start com.newsai.daily-report
```

### Rate Limiting Brave API

- Il sistema ha un delay di **300ms tra le query** (riga 320 di `generate-report.js`)
- Con 15 query totali, un report impiega ~5 secondi
- Se ricevi errori 429, aumenta il delay a 500-1000ms

---

## Riferimenti Tecnici

### Dipendenze

| Pacchetto | Versione | Scopo |
|-----------|----------|-------|
| `express` | ^4.21.0 | Server web per servire il report |
| `nodemailer` | ^6.9.15 | Invio email SMTP |
| `puppeteer` | ^25.1.0 | Conversione HTML → PDF |
| `node-cron` | ^3.0.3 | (Opzionale) cron in-process |

### API Endpoints (Server Web)

| Endpoint | Metodo | Risposta |
|----------|--------|----------|
| `/` | GET | Report HTML completo |
| `/api/latest` | GET | JSON con metadati del report |

### Formato Report HTML

Il report generato segue specifiche precise:
- **NO Markdown** — solo tag HTML puri
- **Stili inline** — compatibile con Google Docs e client email
- **Link alle fonti** — formato `[Fonte: Nome Piattaforma]` con URL ipertestuale
- **Tabelle comparative** — prezzi API, benchmark (se disponibili)
- **Encoding UTF-8** — supporto caratteri speciali e emoji

---

## Roadmap & Idee Future

- [ ] Supporto per multiple API di ricerca (Bing, SerpAPI) come fallback
- [ ] Analisi sentiment dei risultati con NLP
- [ ] Dashboard web interattiva con storico
- [ ] Notifiche Telegram/Slack in alternativa all'email
- [ ] Template di ricerca predefiniti per diversi domini
- [ ] Rilevamento automatico della data nelle query (anziché hardcoded)
- [ ] Rate limiting adattivo basato sugli header di risposta

---

## Licenza

MIT — Libero utilizzo, modifica e distribuzione.

---

**Creato con ❤️ per la ricerca automatizzata — Riutilizzabile per qualsiasi dominio.**