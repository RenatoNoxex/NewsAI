# Jesi News

Sito web di notizie sulla città di **Jesi** — aggiornato quotidianamente con report PDF automatici.

**URL:** https://www.exmu.it/iesi/

## Categorie
- 🏗️ Urbanistica
- 🎭 Cultura
- ⚽ Sport
- 🤝 Sociale
- 📰 Attualità

## Avvio locale
```bash
cd jesi
python -m http.server 8765
# Apri http://localhost:8765
```

## Pubblicare un nuovo PDF
Trascina il PDF su `pubblica_e_carica.bat`

Oppure da terminale:
```bash
python scripts/pubblica_e_deploy.py "percorso/del/file.pdf"
```

## Deploy su Aruba
```bash
python scripts/deploy_aruba.py
```

## Invio email giornaliero (ore 07:00)
```bash
python scripts/invia_riepilogo.py --test     # test
python scripts/invia_riepilogo.py            # invia subito
python scripts/invia_riepilogo.py --setup-task  # crea task automatico
```

## Configurazione
Modifica `.env` con le credenziali FTP Aruba e Gmail.

Vedi `GUIDA_COMPLETA.md` per la documentazione completa.