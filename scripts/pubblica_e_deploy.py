#!/usr/bin/env python3
"""
Jesi News - Pubblica Report e Deploy su Aruba
==============================================
Workflow completo: parsing PDF -> aggiornamento JSON -> upload su Aruba.

Uso:
    python scripts/pubblica_e_deploy.py <percorso-pdf>

Esempio:
    python scripts/pubblica_e_deploy.py C:\\Users\\renat\\Downloads\\report-jesi-10-06-2026.pdf

Passaggi:
    1. Copia il PDF in data/
    2. Esegue parse_report.py per estrarre articoli
    3. Carica su Aruba: articles.json
"""
import os
import sys
import subprocess
import json
from pathlib import Path
import shutil

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


# --- Percorsi ----------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
PARSE_SCRIPT = SCRIPTS_DIR / "parse_report.py"
DEPLOY_SCRIPT = SCRIPTS_DIR / "deploy_aruba.py"
ARTICLES_JSON = DATA_DIR / "articles.json"


def main():
    print()
    print(f"{Colors.BOLD}{Colors.BLUE}============================================{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}  Jesi News - Pubblica & Deploy{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}============================================{Colors.RESET}")
    print()

    # -- 1. Verifica argomento PDF -------------------------------
    if len(sys.argv) < 2:
        error("Specifica il percorso del file PDF")
        print()
        print("   Uso: python scripts/pubblica_e_deploy.py <percorso-pdf>")
        print()
        print("   Esempio:")
        print(f'   python scripts\\pubblica_e_deploy.py "C:\\Users\\renat\\Downloads\\report-jesi-10-06-2026.pdf"')
        print()
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        error(f"File non trovato: {pdf_path}")
        sys.exit(1)

    ok(f"PDF trovato: {pdf_path.name}")

    # -- 2. Verifica deploy_aruba.py esista ----------------------
    if not DEPLOY_SCRIPT.exists():
        warn("scripts/deploy_aruba.py non trovato. Esegui solo parsing locale.")
        do_deploy = False
    else:
        do_deploy = True

    # -- 3. Copia PDF in data/ -----------------------------------
    dest_pdf = DATA_DIR / pdf_path.name
    if pdf_path.resolve() != dest_pdf.resolve():
        shutil.copy2(pdf_path, dest_pdf)
        ok(f"PDF copiato in data/{pdf_path.name}")
    else:
        info(f"PDF gia' in data/{pdf_path.name}")

    # -- 4. Esegui parse_report.py --------------------------------
    info("Esecuzione parsing PDF...")
    result = subprocess.run(
        [sys.executable, str(PARSE_SCRIPT), str(dest_pdf), "-o", str(ARTICLES_JSON)],
        capture_output=True,
        text=True,
        cwd=PROJECT_ROOT,
    )

    # Filtra warning pdfminer
    for line in result.stdout.splitlines():
        if "Could not get FontBBox" not in line and line.strip():
            print(f"   {line}")

    if result.stderr:
        for line in result.stderr.splitlines():
            if "Could not get FontBBox" not in line and line.strip():
                print(f"   {line}")

    if result.returncode != 0:
        error(f"Parsing fallito (exit code {result.returncode})")
        sys.exit(1)

    ok("Parsing completato!")
    print()

    # -- 5. Statistiche -------------------------------------------
    try:
        with open(ARTICLES_JSON, encoding="utf-8") as f:
            data = json.load(f)
        articles = data.get("articles", [])
        meta = data.get("meta", {})

        cats = {}
        for a in articles:
            cat = a.get("category", "Altro")
            cats[cat] = cats.get(cat, 0) + 1

        info(f"Database: {len(articles)} articoli")
        info(f"Report: {meta.get('date', '?')}")
        for cat, n in sorted(cats.items()):
            print(f"    - {cat}: {n}")
    except Exception as e:
        warn(f"Impossibile leggere statistiche: {e}")

    print()

    # -- 6. Deploy su Aruba ---------------------------------------
    if do_deploy:
        info("Caricamento su Aruba...")
        deploy_result = subprocess.run(
            [sys.executable, str(DEPLOY_SCRIPT), "--only-json"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        )
        # Mostra output
        for line in deploy_result.stdout.splitlines():
            if line.strip():
                print(f"   {line}")

        if deploy_result.returncode == 0:
            print()
            ok(f"Sito aggiornato: https://www.exmu.it/iesi/")
        else:
            warn("Deploy fallito. Puoi eseguirlo manualmente:")
            info(f"   python scripts/deploy_aruba.py --only-json")
    else:
        warn("Deploy saltato (deploy_aruba.py non configurato)")
        info("Per pubblicare su Aruba:")
        info(f"   1. Copia .env.example come .env e inserisci le credenziali FTP")
        info(f"   2. Esegui: python scripts/deploy_aruba.py --only-json")

    # -- 7. Fine --------------------------------------------------
    print()
    print(f"{Colors.BOLD}{Colors.GREEN}============================================{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.GREEN}  Operazione completata{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.GREEN}============================================{Colors.RESET}")


if __name__ == "__main__":
    main()