#!/usr/bin/env python3
"""
Jesi News - Invia Riepilogo Giornaliero via Gmail
==================================================
Legge articles.json, prepara un riepilogo degli ultimi articoli
e lo invia alla Gmail usando SMTP con App Password.

Uso:
    python scripts/invia_riepilogo.py                        # invia riepilogo
    python scripts/invia_riepilogo.py --send-to "altra@email.com"  # a indirizzo specifico
    python scripts/invia_riepilogo.py --no-send              # solo preview a schermo
    python scripts/invia_riepilogo.py --test                 # invia email di test

Configurazione:
    Aggiungi queste variabili al file .env:
        GMAIL_USER=tuaemail@gmail.com
        GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx    (App Password a 16 caratteri)
        MAIL_TO=tuaemail@gmail.com                 (destinatario, default = GMAIL_USER)

    Come generare l'App Password Gmail:
        1. Vai su https://myaccount.google.com/security
        2. Attiva "Verifica in due passaggi" (se non l'hai già)
        3. Vai su "Password per app"
        4. Genera una password per "Posta" / "Windows Computer"
        5. Usa quella password (16 lettere, senza spazi)
"""
import os
import sys
import json
import smtplib
import email.utils
from datetime import datetime, timedelta, timezone
from pathlib import Path
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# --- Fuso orario Italia (CEST = UTC+2) ---------------------------
try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Europe/Rome")
except (ImportError, ModuleNotFoundError, Exception):
    TZ = timezone(timedelta(hours=2), "CEST")

def adesso():
    """Restituisce datetime.now con fuso orario Italia (CEST, UTC+2)."""
    return datetime.now(TZ)

# --- Percorsi ----------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOTENV_PATH = PROJECT_ROOT / ".env"
ARTICLES_JSON = PROJECT_ROOT / "data" / "articles.json"

# --- Colori terminale -------------------------------------------
class Colors:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    BOLD = "\033[1m"
    RESET = "\033[0m"

def info(msg):
    print(f"{Colors.BLUE}[i]{Colors.RESET} {msg}")

def ok(msg):
    print(f"{Colors.GREEN}[OK]{Colors.RESET} {msg}")

def warn(msg):
    print(f"{Colors.YELLOW}[!]{Colors.RESET} {msg}")

def error(msg):
    print(f"{Colors.RED}[ERR]{Colors.RESET} {msg}")


# --- Carica .env -------------------------------------------------
def load_env():
    if not DOTENV_PATH.exists():
        error(f"File .env non trovato: {DOTENV_PATH}")
        print()
        info("Aggiungi le credenziali Gmail nel file .env:")
        print("   GMAIL_USER=tuaemail@gmail.com")
        print("   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx")
        print("   MAIL_TO=tuaemail@gmail.com")
        print()
        sys.exit(1)

    with open(DOTENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ[key.strip()] = value.strip().strip("\"'")

    required = ["GMAIL_USER", "GMAIL_APP_PASSWORD"]
    missing = [k for k in required if k not in os.environ]
    if missing:
        error(f"Variabili Gmail mancanti in .env: {', '.join(missing)}")
        print()
        info("Aggiungi al file .env:")
        print('   GMAIL_USER=tuaemail@gmail.com')
        print('   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx')
        print()
        info("Come generare l'App Password:")
        print('   1. Vai su https://myaccount.google.com/security')
        print('   2. Attiva "Verifica in due passaggi"')
        print('   3. Vai su "Password per app"')
        print('   4. Genera password per "Posta" / "Windows Computer"')
        print()
        sys.exit(1)

    return {
        "user": os.environ["GMAIL_USER"],
        "password": os.environ["GMAIL_APP_PASSWORD"],
        "mail_to": os.environ.get("MAIL_TO", os.environ["GMAIL_USER"]),
    }


# --- Carica articles.json ----------------------------------------
def load_articles():
    if not ARTICLES_JSON.exists():
        error(f"File non trovato: {ARTICLES_JSON}")
        sys.exit(1)

    with open(ARTICLES_JSON, encoding="utf-8") as f:
        return json.load(f)


# --- Genera riepilogo HTML ---------------------------------------
def genera_riepilogo_html(data, giorni=1):
    """Crea un riepilogo HTML degli articoli degli ultimi N giorni."""
    articles = data.get("articles", [])
    meta = data.get("meta", {})

    oggi = adesso()
    data_limite = oggi - timedelta(days=giorni)

    # Filtra articoli recenti (di oggi o dei giorni specificati)
    articoli_recenti = []
    for a in articles:
        try:
            data_art = datetime.strptime(a.get("date", ""), "%Y-%m-%d").replace(tzinfo=TZ)
            if data_art >= data_limite:
                articoli_recenti.append(a)
        except (ValueError, TypeError, Exception):
            pass

    # Se non ci sono articoli recenti, prendi gli ultimi 10
    if not articoli_recenti:
        articoli_recenti = articles[:10]

    # Raggruppa per categoria
    grouped = {}
    for a in articoli_recenti:
        cat = a.get("category", "Altro")
        grouped.setdefault(cat, []).append(a)

    # Costruisci HTML
    n_articoli = len(articoli_recenti)
    n_totali = len(articles)

    html_parts = []

    html_parts.append(f"""<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jesi News - Riepilogo Giornaliero</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a2e; padding: 20px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px;">
                    <tr>
                        <td style="color: #ffffff; font-size: 28px; font-weight: bold; padding: 10px 20px;">
                            <span style="color: #C0392B;">Jesi</span> News
                        </td>
                    </tr>
                    <tr>
                        <td style="color: #aaaaaa; font-size: 14px; padding: 0 20px 20px;">
                            Riepilogo del {oggi.strftime("%d/%m/%Y")} &middot; {n_articoli} articoli recenti
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px;">
""")

    # Sezione per ogni categoria
    for cat, items in sorted(grouped.items()):
        colori_cat = {
            "Urbanistica": "#8E44AD",
            "Cultura": "#2980B9",
            "Sport": "#27AE60",
            "Sociale": "#E67E22",
            "Attualità": "#C0392B",
        }
        colore = colori_cat.get(cat, "#C0392B")

        html_parts.append(f"""
                    <tr>
                        <td style="background-color: {colore}; color: #ffffff; padding: 8px 16px; font-size: 14px; font-weight: bold; border-radius: 6px 6px 0 0;">
                            {cat} ({len(items)})
                        </td>
                    </tr>
""")

        for a in items:
            abstract = a.get("abstract", "")
            if len(abstract) > 200:
                abstract = abstract[:197] + "..."

            html_parts.append(f"""
                    <tr>
                        <td style="background-color: #ffffff; padding: 16px 20px; border-bottom: 1px solid #e8e8e8;">
                            <a href="https://www.exmu.it/iesi/article.html?id={a.get("id", "")}" style="color: #1a1a2e; text-decoration: none;">
                                <strong style="font-size: 16px; color: #1a1a2e;">{a.get("title", "")}</strong>
                            </a>
                            <p style="margin: 6px 0 0; font-size: 13px; color: #666666; line-height: 1.4;">
                                {abstract}
                            </p>
                            <div style="margin-top: 8px; font-size: 11px; color: #999999;">
                                {a.get("date", "")} &middot; {a.get("source", "")}
                            </div>
                        </td>
                    </tr>
""")

    # Footer
    html_parts.append(f"""
                    <tr>
                        <td style="text-align: center; padding: 20px; font-size: 12px; color: #999999;">
                            <p style="margin: 0;">Database: {n_totali} articoli totali</p>
                            <p style="margin: 4px 0 0;">
                                <a href="https://www.exmu.it/iesi/" style="color: #C0392B; text-decoration: none;">Apri il sito &rarr;</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a2e; padding: 15px 0;">
        <tr>
            <td align="center" style="color: #666666; font-size: 11px; padding: 10px;">
                Jesi News &middot; Inviato automaticamente alle 07:00
            </td>
        </tr>
    </table>
</body>
</html>
""")

    return "\n".join(html_parts)


# --- Genera riepilogo testo ---------------------------------------
def genera_riepilogo_testo(data, giorni=1):
    """Versione testo semplice (fallback)."""
    articles = data.get("articles", [])
    meta = data.get("meta", {})

    oggi = adesso()
    data_limite = oggi - timedelta(days=giorni)

    articoli_recenti = []
    for a in articles:
        try:
            data_art = datetime.strptime(a.get("date", ""), "%Y-%m-%d").replace(tzinfo=TZ)
            if data_art >= data_limite:
                articoli_recenti.append(a)
        except (ValueError, TypeError, Exception):
            pass

    if not articoli_recenti:
        articoli_recenti = articles[:10]

    lines = []
    lines.append("=" * 60)
    lines.append("  JESI NEWS — RIEPILOGO GIORNALIERO")
    lines.append(f"  {oggi.strftime('%d/%m/%Y')}  |  {len(articoli_recenti)} articoli recenti")
    lines.append("=" * 60)
    lines.append("")

    grouped = {}
    for a in articoli_recenti:
        cat = a.get("category", "Altro")
        grouped.setdefault(cat, []).append(a)

    for cat, items in sorted(grouped.items()):
        lines.append(f"  [{cat} — {len(items)}]")
        lines.append("-" * 60)
        for a in items:
            abstract = a.get("abstract", "")
            if len(abstract) > 150:
                abstract = abstract[:147] + "..."
            lines.append(f"    * {a.get('title', '')}")
            lines.append(f"      {abstract}")
            lines.append(f"      Fonte: {a.get('source', '?')}  |  {a.get('date', '')}")
            lines.append("")
        lines.append("")

    lines.append("=" * 60)
    lines.append(f"  Database: {len(articles)} articoli totali")
    lines.append(f"  Sito: https://www.exmu.it/iesi/")
    lines.append("=" * 60)

    return "\n".join(lines)


# --- Invia email --------------------------------------------------
def invia_email(creds, html_body, testo_body, subject=None):
    if subject is None:
        subject = f"Jesi News - Riepilogo del {adesso().strftime('%d/%m/%Y')}"

    msg = MIMEMultipart("alternative")
    msg["From"] = f"Jesi News <{creds['user']}>"
    msg["To"] = creds["mail_to"]
    msg["Subject"] = subject
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg["Message-ID"] = email.utils.make_msgid()

    # Versione testo (fallback)
    parte_testo = MIMEText(testo_body, "plain", "utf-8")
    msg.attach(parte_testo)

    # Versione HTML
    parte_html = MIMEText(html_body, "html", "utf-8")
    msg.attach(parte_html)

    try:
        info(f"Connessione a Gmail SMTP...")
        server = smtplib.SMTP("smtp.gmail.com", 587, timeout=30)
        server.starttls()
        server.login(creds["user"], creds["password"])
        server.sendmail(creds["user"], creds["mail_to"], msg.as_string())
        server.quit()
        ok(f"Email inviata a {creds['mail_to']}")
        return True
    except smtplib.SMTPAuthenticationError:
        error("Autenticazione Gmail fallita!")
        info("Possibili cause:")
        info("  1. L'App Password non e' corretta")
        info("  2. La verifica in due passaggi non e' attiva")
        info("  3. L'App Password e' stata revocata")
        info("  4. Hai cambiato la password Gmail recentemente")
        print()
        info("Per generare una nuova App Password:")
        info("  1. Vai su https://myaccount.google.com/security")
        info("  2. Attiva 'Verifica in due passaggi'")
        info("  3. Vai su 'Password per app'")
        info("  4. Genera password per 'Posta' / 'Windows Computer'")
        return False
    except Exception as e:
        error(f"Invio email fallito: {e}")
        return False


# --- Preview a schermo --------------------------------------------
def mostra_preview(data):
    testo = genera_riepilogo_testo(data)
    print()
    print(testo)
    print()
    info(f"Per inviare questa email, esegui senza il flag --no-send")


# --- Crea task schedulato (Windows) --------------------------------
def crea_task_windows():
    """Genera uno script .bat per creare il task schedulato su Windows."""
    python_path = sys.executable
    script_path = Path(__file__).resolve()
    bat_content = f"""@echo off
title Jesi News - Crea Task Schedulato (07:00 ogni giorno)

echo ============================================
echo   Jesi News - Programma Invio Automatico
echo ============================================
echo.
echo Questo script crea un'attivita' di Windows Task Scheduler
echo che esegue l'invio email ogni giorno alle 07:00.
echo.
echo Python: {python_path}
echo Script: {script_path}
echo.

:: Crea la cartella nel Task Scheduler se non esiste
schtasks /Create /TN "Jesi News\\Invio Riepilogo Giornaliero" /TR "\\"{python_path}\\" \\"{script_path}\\"" /SC DAILY /ST 07:00 /F

if %errorlevel% equ 0 (
    echo [OK] Task creato correttamente!
    echo.
    echo   Nome: Jesi News\\Invio Riepilogo Giornaliero
    echo   Ora:  07:00 ogni giorno
    echo   Script: {script_path}
    echo.
    echo Per verificare: Esegui "schtasks /Query /TN Jesi News\\Invio Riepilogo Giornaliero"
    echo Per rimuovere: Esegui "schtasks /Delete /TN Jesi News\\Invio Riepilogo Giornaliero /F"
) else (
    echo [ERR] Impossibile creare il task.
    echo   Prova ad eseguire come Amministratore.
    echo   Oppure crealo manualmente da "Utilità di pianificazione" di Windows.
)

pause
"""
    return bat_content


# --- Main ---------------------------------------------------------
def main():
    print()
    print(f"{Colors.BOLD}{Colors.BLUE}============================================{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}  Jesi News - Invio Riepilogo Giornaliero{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}============================================{Colors.RESET}")
    print()

    # -- Flag --setup-task: crea solo il task Windows ------------
    if "--setup-task" in sys.argv:
        bat_content = crea_task_windows()
        bat_path = PROJECT_ROOT / "scripts" / "crea_task_7am.bat"
        with open(bat_path, "w", encoding="utf-8") as f:
            f.write(bat_content)
        ok(f"Script creato: {bat_path}")
        info("Eseguilo come Amministratore per creare il task schedulato.")
        print()
        info("Oppure usa PowerShell (come Admin):")
        print(f'   schtasks /Create /TN "Jesi News\\Invio Riepilogo Giornaliero" /TR "\\"{sys.executable}\\" \\"{Path(__file__).resolve()}\\"" /SC DAILY /ST 07:00 /F')
        return

    # -- Carica configurazione ------------------------------------
    creds = load_env()

    # -- Test: invia email di test --------------------------------
    if "--test" in sys.argv:
        info("Invio email di test...")
        html = f"""<html><body style="font-family:Arial;padding:20px;">
            <h2 style="color:#C0392B;">Jesi News — Email di Test</h2>
            <p>Questa e' una email di test per verificare la configurazione SMTP.</p>
            <p>Se ricevi questo messaggio, la configurazione funziona correttamente.</p>
            <hr>
            <p style="font-size:12px;color:#999;">Jesi News &middot; {adesso().strftime("%d/%m/%Y %H:%M")}</p>
        </body></html>"""
        testo = "Jesi News - Email di Test\n\nSe ricevi questo messaggio, la configurazione funziona correttamente."
        invia_email(creds, html, testo, subject=f"Jesi News - Test Configurazione ({adesso().strftime('%H:%M')})")
        return

    # -- Carica dati ----------------------------------------------
    data = load_articles()
    meta = data.get("meta", {})

    n_totali = len(data.get("articles", []))
    info(f"Database: {n_totali} articoli caricati")
    info(f"Report: {meta.get('date', '?')}")

    # -- Genera riepilogo -----------------------------------------
    giorni = 1
    if "--giorni" in sys.argv:
        idx = sys.argv.index("--giorni")
        if idx + 1 < len(sys.argv):
            try:
                giorni = int(sys.argv[idx + 1])
            except ValueError:
                pass

    html_body = genera_riepilogo_html(data, giorni=giorni)
    testo_body = genera_riepilogo_testo(data, giorni=giorni)

    # -- Solo preview ---------------------------------------------
    if "--no-send" in sys.argv:
        mostra_preview(data)
        return

    # -- Invia email ----------------------------------------------
    subject = f"Jesi News - Riepilogo del {adesso().strftime('%d/%m/%Y')}"
    success = invia_email(creds, html_body, testo_body, subject=subject)

    if success:
        print()
        print(f"{Colors.BOLD}{Colors.GREEN}============================================{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.GREEN}  Email inviata con successo!{Colors.RESET}")
        print(f"{Colors.BOLD}{Colors.GREEN}============================================{Colors.RESET}")
        print()
        ok("Per programmare l'invio automatico ogni giorno alle 07:00:")
        info(f"  python scripts/invia_riepilogo.py --setup-task")
        print()
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()