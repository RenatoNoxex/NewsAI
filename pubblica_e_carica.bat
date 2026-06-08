@echo off
title Jesi News - Pubblica e Carica su Aruba

echo ============================================
echo   Jesi News - Pubblica e Carica su Aruba
echo ============================================
echo.

REM ── Controlla se è stato trascinato un file ──
if "%~1"=="" (
    echo ERRORE: Trascina il file PDF sopra questo file .bat
    echo.
    echo    Oppure usa:
    echo       pubblica_e_carica.bat C:\percorso\report.pdf
    echo.
    pause
    exit /b 1
)

set PDF_PATH=%~1

REM ── Mostra debug estensione ──
echo File: %~nx1
echo Estensione rilevata: %~x1
echo.

REM ── Verifica che il file esista ──
if not exist "%PDF_PATH%" (
    echo ERRORE: File non trovato: %PDF_PATH%
    pause
    exit /b 1
)

echo PDF trovato: %~nx1
echo.

REM ── Esegui parsing + deploy ──
python "%~dp0scripts\pubblica_e_deploy.py" "%PDF_PATH%"

REM ── Controlla se il comando ha funzionato ──
if %errorlevel% neq 0 (
    echo.
    echo Si e' verificato un errore. Controlla i messaggi sopra.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   FATTO!
echo   https://www.exmu.it/iesi/
echo ============================================
echo.
echo Premi un tasto per chiudere...
pause >nul