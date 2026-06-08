# Jesi News — Guida Completa al Progetto

> 📅 Creato: 08/06/2026
> Questo file riassume TUTTO il progetto in modo chiaro e leggibile per futuri aggiustamenti.

---

## 1. COS'È QUESTO PROGETTO

Sito web statico che converte **report PDF giornalieri** in una pagina con articoli suddivisi per data e categoria, con invio email automatico ogni mattina alle 7:00.

**Tema:** Notizie dalla città di **Jesi** (J, E, S, I)
**URL live:** https://www.exmu.it/iesi/

**Categorie principali:**
- 🏗️ Urbanistica
- 🎭 Cultura
- ⚽ Sport
- 🤝 Sociale
- 📰 Attualità

---

## 2. STRUTTURA DEL PROGETTO

```
jesi/
│
├── index.html              ← Homepage (pagina principale)
├── article.html            ← Pagina singolo articolo (?id=...)
├── category.html           ← Pagina per categoria (?cat=urbanistica)
├── admin.html              ← Pannello admin (stato database)
│
├── css/
│   ├── style.css           ← Tutti gli stili (tema rosso Jesi #C0392B)
│   └── style.v2.css        ← Copia per bypass cache Aruba
│
├── js/
│   ├── app.js              ← Logica JavaScript (carica JSON, renderizza pagine)
│   └── app.v2.js           ← Copia per bypass cache Aruba
│
├── data/
│   └── articles.json       ← DATABASE: tutti gli articoli
│
├── scripts/
│   ├── parse_report.py     ← Legge PDF → estrae articoli → salva in articles.json
│   ├── deploy_aruba.py     ← Carica i file su Aruba via FTP
│   ├── pubblica_e_deploy.py← Unisce parsing + deploy in un comando
│   ├── invia_riepilogo.py  ← Invia email riepilogo giornaliero ore 07:00
│   └── crea_task_7am.bat   ← Generato da --setup-task
│
├── pubblica_e_carica.bat   ← DRAG & DROP: trascini PDF → parsing + deploy
│
├── .env                    ← CREDENZIALI (FTP + Gmail)
├── .env.example            ← Template credenziali (da copiare come .env)
│
├── GUIDA_COMPLETA.md       ← QUESTO FILE (guida operativa)
└── README.md               ← Panoramica rapida
```

---

## 3. FLUSSO DI LAVORO COMPLETO

```
1. Ricevi PDF del giorno con le notizie di Jesi
         │
         ▼
2. Trascini PDF su pubblica_e_carica.bat
         │
         ▼
3. parse_report.py estrae gli articoli dal PDF
   e li aggiunge a data/articles.json
   (evita duplicati controllando i titoli)
         │
         ▼
4. deploy_aruba.py carica articles.json su Aruba
         │
         ▼
5. Sito aggiornato su https://www.exmu.it/iesi/
         │
         ▼
6. Ogni mattina alle 07:00 → invia_riepilogo.py
   invia email con riepilogo a boroccirenato@gmail.com
```

---

## 4. COME PUBBLICARE UN NUOVO PDF

### Metodo 1 — DRAG & DROP (consigliato)
1. Scarica il PDF del giorno con le notizie di Jesi
2. Trascinalo sopra `pubblica_e_carica.bat`
3. Il terminale mostra "Operazione completata"

### Metodo 2 — Da terminale
```bash
python scripts/pubblica_e_deploy.py "C:\Users\renat\Downloads\nome-file.pdf"
```

### Se non funziona
- `pip install pdfminer.six` (se dà errore sul parsing)
- `python scripts/deploy_aruba.py --only-json` (forza upload)

---

## 5. NAVIGAZIONE GIORNO PER GIORNO

La homepage mostra **solo un giorno alla volta** per evitare pagine infinite.

- **Barra date in alto** sotto le categorie — clicchi e cambi giorno
- **Il giorno più recente** ha il badge rosso "Ultimo"
- **Categorie** aperte con tutti gli articoli del giorno selezionato
- **Pagine categoria** stessi pulsanti per navigare tra i giorni

File coinvolti:
- `js/app.js` — logica del navigatore date
- `css/style.css` — stili dei pulsanti `.date-btn`, `.date-nav-container`, `.day-block`
- `index.html` — contiene `<div class="date-nav-container" id="date-nav">`
- `category.html` — contiene lo stesso navigatore

---

## 6. INVIO EMAIL GIORNALIERO (ORE 07:00)

### Come funziona
- **Script:** `scripts/invia_riepilogo.py`
- **Orario:** Ogni giorno alle 07:00 (fuso Italia CEST, UTC+2)
- **A chi:** `boroccirenato@gmail.com`
- **Cosa contiene:** riepilogo con titoli, abstract, categorie, diviso per sezione

### Comandi
```bash
python scripts/invia_riepilogo.py              # invia subito
python scripts/invia_riepilogo.py --test        # email di test
python scripts/invia_riepilogo.py --no-send     # preview a schermo
python scripts/invia_riepilogo.py --setup-task  # ricrea task Windows
```

### Task Scheduler Windows
- **Nome:** `Jesi News\Invio Riepilogo Giornaliero`
- **Esecuzione:** Ogni giorno alle 07:00
- **Stato:** Da attivare con `--setup-task`

### Credenziali (in `.env`)
```
GMAIL_USER=boroccirenato@gmail.com
GMAIL_APP_PASSWORD=olhp gymm isbn gazn
MAIL_TO=boroccirenato@gmail.com
```

> ⚠️ Se cambi password Gmail o revochi l'App Password, genera una nuova:
> 1. https://myaccount.google.com/apppasswords
> 2. App: Posta → Dispositivo: Windows Computer
> 3. Copia password 16 caratteri in `.env`

---

## 7. TRIGGER GIORNALIERO ORE 19:00 (G-Tab)

Il sistema è configurato per ricevere news quotidianamente. Il flusso G-Tab:

1. **Ore 19:00** — Il trigger giornaliero deposita il PDF nella cartella `jesi/data/`
2. **Parso il PDF** — Lo script `parse_report.py` estrae gli articoli
3. **Aggiornato il JSON** — `articles.json` viene aggiornato con i nuovi articoli
4. **Caricato su Aruba** — Il deploy carica i file su `www.exmu.it/iesi/`
5. **Ore 07:00 (mattina dopo)** — Email di riepilogo automatica

### Automatizzare il trigger delle 19:00
```bash
# Crea il task schedulato per eseguire il parsing alle 19:00
schtasks /Create /TN "Jesi News\Trigger Parso Giornaliero" /TR "python C:\Users\renat\Desktop\CLINE\jesi\scripts\pubblica_e_deploy.py C:\Users\renat\Desktop\CLINE\jesi\data\report-giornaliero.pdf" /SC DAILY /ST 19:00 /F
```

---

## 8. SE IL PARSER PDF NON FUNZIONA

### Causa più comune
`pdfminer.six` non installato:
```bash
pip install pdfminer.six
```

### Se il formato del PDF cambia
Modifica `scripts/parse_report.py` → sezioni `SECTION_NAMES` e `SECTION_PATTERNS`.

Per vedere il testo estratto dal PDF:
```bash
python -c "from pdfminer.high_level import extract_text; print(extract_text('data/file.pdf')[:2000])"
```

---

## 9. CREDENZIALI FTP ARUBA (in `.env`)

```
FTP_HOST=ftp.exmu.it
FTP_USER=1274854@aruba.it
FTP_PASS=4Ba34qaq!!
FTP_TARGET_DIR=/www.exmu.it/iesi/
```

### Comandi deploy
```bash
python scripts/deploy_aruba.py               # carica TUTTI i file
python scripts/deploy_aruba.py --only-json   # solo articles.json
python scripts/deploy_aruba.py --check       # test connessione
```

> ⚠️ Aruba ha una cache aggressiva. Se dopo il deploy il sito non cambia:
> - I file `style.v2.css` e `js/app.js?v=2` bypassano la cache
> - Oppure premi Ctrl+F5 nel browser

---

## 10. STATISTICHE DATABASE

```bash
# Conta articoli totali
python -c "import json; d=json.load(open('data/articles.json')); print(len(d['articles']), 'articoli')"

# Categorie e date
python -c "
import json; d=json.load(open('data/articles.json'))
from collections import Counter
cats = Counter(a['category'] for a in d['articles'])
dates = set(a['date'] for a in d['articles'])
print('Categorie:', dict(cats))
print('Date:', sorted(dates))
"
```

---

## 11. FILE DA NON MODIFICARE MANUALMENTE

| File | Perché |
|------|--------|
| `data/articles.json` | Generato automaticamente dal parser |
| `css/style.v2.css` | Copia di style.css per cache Aruba |
| `js/app.v2.js` | Copia di app.js per cache Aruba |
| `scripts/crea_task_7am.bat` | Generato da `--setup-task` |

---

## 12. COMANDI RAPIDI

```bash
# Installare dipendenza PDF
pip install pdfminer.six

# Pubblicare PDF (1 comando)
python scripts/pubblica_e_deploy.py "percorso/pdf.pdf"

# Solo parsing
python scripts/parse_report.py "data/file.pdf" -o "data/articles.json"

# Solo upload
python scripts/deploy_aruba.py
python scripts/deploy_aruba.py --only-json

# Invio email
python scripts/invia_riepilogo.py
python scripts/invia_riepilogo.py --test

# Avvio server locale (test)
python -m http.server 8765
# Apri http://localhost:8765
```

---

## 13. CONFIGURAZIONE INIZIALE (DA FARE UNA VOLTA)

```bash
# 1. Installa dipendenze Python
pip install pdfminer.six

# 2. Verifica connessione FTP
python scripts/deploy_aruba.py --check

# 3. Carica sito iniziale su Aruba
python scripts/deploy_aruba.py

# 4. Test invio email
python scripts/invia_riepilogo.py --test

# 5. Crea task schedulato per email ore 07:00
python scripts/invia_riepilogo.py --setup-task

# 6. (Opzionale) Crea task schedulato per trigger ore 19:00
# Vedi sezione 7 di questa guida
```

---

## 14. CRONOLOGIA MODIFICHE

| Data | Modifica | Dettaglio |
|------|----------|-----------|
| 08/06 | Creazione progetto | Sito Jesi News creato da template AI News |
| 08/06 | Tema Jesi | Colore rosso #C0392B, categorie Urbanistica/Cultura/Sport/Sociale/Attualità |
| 08/06 | URL Aruba | Configurato per www.exmu.it/iesi/ |
| 08/06 | Email Gmail | Configurato per boroccirenato@gmail.com |

---

*Fine guida — per modifiche, aggiorna questo file.*