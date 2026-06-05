# NewsAI Daily Report

Genera automaticamente ogni giorno alle **7:00 AM CET** un report HTML di intelligence sui modelli AI (DeepSeek, Kimi, Qwen, Claude, Gemini + panoramica globale) e lo invia via email in formato PDF.

## Come funziona

Il workflow GitHub Actions si attiva alle 5:00 UTC (7:00 CET) ogni giorno, esegue:
1. `npm ci` — installa dipendenze
2. `generate-report.js` — cerca sul web tramite Brave Search API gli aggiornamenti nelle ultime 24 ore e produce `reports/report-ai.html`
3. `send-email.js` — converte il report in PDF via Puppeteer e lo invia via email tramite SMTP

Il report viene anche salvato come artifact GitHub per 7 giorni.

## Setup

### 1. Crea repository su GitHub

```bash
gh repo create NewsAI --public --source . --remote origin --push
```

Se non hai `gh`, crea il repo manualmente su github.com e poi:

```bash
git remote add origin git@github.com:TUO_USERNAME/NewsAI.git
git branch -M main
git push -u origin main
```

### 2. Configura i GitHub Secrets

Vai su **Settings → Secrets and variables → Actions** del repository e aggiungi:

| Secret Name     | Valore                                 |
|-----------------|----------------------------------------|
| `BRAVE_API_KEY` | La tua API key Brave Search            |
| `EMAIL_FROM`    | Indirizzo mittente (es. `nome@gmail.com`) |
| `EMAIL_TO`      | Indirizzo destinatario                 |
| `SMTP_HOST`     | Host SMTP (es. `smtp.gmail.com`)       |
| `SMTP_PORT`     | Porta SMTP (es. `587`)                 |
| `SMTP_USER`     | Username SMTP                          |
| `SMTP_PASS`     | Password SMTP o App Password           |

### 3. Test manuale

Dal tab **Actions** del repository, seleziona "Daily AI Report" e clicca **Run workflow**.

## Esecuzione locale (opzionale)

```bash
# Installa dipendenze
npm install

# Genera il report HTML
npm run generate

# Invia email con PDF
npm run send-email

# Avvia server web locale sulla porta 3000
npm run serve

# Configura cron job macOS (launchd)
npm run setup-cron
```

Requisiti: Node.js ≥ 18, `config.json` con API key Brave e credenziali SMTP.