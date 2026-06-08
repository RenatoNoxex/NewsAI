#!/usr/bin/env python3
"""
Jesi News - Scraper Automatico
===============================
Raccoglie articoli dalle principali testate locali su Jesi e li salva in articles.json.

Fonti:
  - viverejesi.it (già funzionante via HTML scraping)
  - qdmnotizie.it (WordPress + Zox News theme)
  - centropagina.it
  - leggopassword.it
  - vocedellavallesina.it

Uso:
    python scripts/scrape_news.py                  # raccoglie e salva
    python scripts/scrape_news.py --dry-run        # solo anteprima
"""
import json
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from html.parser import HTMLParser

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Europe/Rome")
except Exception:
    TZ = timezone(timedelta(hours=2), "CEST")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ARTICLES_JSON = PROJECT_ROOT / "data" / "articles.json"

# ==== HTML Parser leggero per estrarre titoli e link ====
class ArticleExtractor(HTMLParser):
    """Estrae titoli potenziali da tag <a> con href di articoli."""
    def __init__(self, base_url, article_path_pattern):
        super().__init__()
        self.base_url = base_url
        self.pattern = re.compile(article_path_pattern)
        self.articles = []
        self._current_href = None
        self._current_title_parts = []
        self._in_article_link = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "a" and "href" in attrs_dict:
            href = attrs_dict["href"]
            full_url = href if href.startswith("http") else self.base_url.rstrip("/") + "/" + href.lstrip("/")
            if self.pattern.search(href):
                self._current_href = full_url
                self._in_article_link = True
                self._current_title_parts = []

    def handle_endtag(self, tag):
        if tag == "a" and self._in_article_link:
            title = " ".join(self._current_title_parts).strip()
            if len(title) > 25:  # ignora link brevi (menu, etc.)
                self.articles.append({
                    "url": self._current_href,
                    "title": title,
                })
            self._in_article_link = False
            self._current_href = None

    def handle_data(self, data):
        if self._in_article_link:
            self._current_title_parts.append(data.strip())


def fetch_html(url, timeout=15):
    """Fetch HTML con urllib (no dipendenze esterne)."""
    import urllib.request
    import urllib.error

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  [!] Errore fetch {url}: {e}")
        return None


def categorizza(titolo):
    """Assegna una categoria in base a parole chiave nel titolo."""
    t = titolo.lower()
    if any(w in t for w in ["lavori", "cantiere", "strada", "pista", "piazza", "parco",
                              "edilizia", "urbanistica", "traffico", "viabilità", "bonifica"]):
        return "Urbanistica"
    if any(w in t for w in ["calcio", "sport", "pallamano", "basket", "campionato",
                              "partita", "gara", "atleta", "olimpiadi", "serie a", "serie b"]):
        return "Sport"
    if any(w in t for w in ["concerto", "mostra", "teatro", "cinema", "libro", "arte",
                              "cultura", "festival", "spettacolo", "musica", "museo"]):
        return "Cultura"
    if any(w in t for w in ["sociale", "volontariato", "beneficenza", "croce rossa",
                              "donazione", "solidarietà", "disabili", "anziani"]):
        return "Sociale"
    return "Attualità"


def estrai_data_da_testo(testo):
    """Cerca una data nel formato YYYY-MM-DD o DD/MM/YYYY nel testo."""
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", testo)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", testo)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return datetime.now(TZ).strftime("%Y-%m-%d")


def genera_abstract(html, title):
    """Tenta di estrarre un abstract dal testo intorno al titolo."""
    # Cerca il primo paragrafo dopo il titolo
    title_clean = re.escape(title[:60])
    m = re.search(title_clean + r'.*?<p[^>]*>(.*?)</p>', html, re.DOTALL | re.IGNORECASE)
    if m:
        abstract = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        if len(abstract) > 30:
            return abstract[:300]
    # Fallback: primo tag p
    m = re.search(r"<p[^>]*>(.*?)</p>", html, re.DOTALL)
    if m:
        abstract = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        if len(abstract) > 30:
            return abstract[:300]
    return ""


# ==== Scraper per ogni fonte ====

def scrape_viverejesi():
    """Scraping da viverejesi.it - homepage."""
    print("[*] Scraping viverejesi.it...")
    html = fetch_html("https://www.viverejesi.it")
    if not html:
        return []
    
    # Pattern: /YYYY/MM/DD/titolo-articolo/ID/
    extractor = ArticleExtractor("https://www.viverejesi.it", r"/\d{4}/\d{2}/\d{2}/[^/]+/\d+/")
    extractor.feed(html)
    
    results = []
    for art in extractor.articles[:10]:  # max 10 articoli
        # Estrai data dall'URL
        m = re.search(r"/(\d{4})/(\d{2})/(\d{2})/", art["url"])
        date_str = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else datetime.now(TZ).strftime("%Y-%m-%d")
        
        results.append({
            "title": art["title"],
            "url": art["url"],
            "source": "Vivere Jesi",
            "date": date_str,
            "category": categorizza(art["title"]),
        })
    
    print(f"  [+] Trovati {len(results)} articoli")
    return results


def scrape_qdmnotizie():
    """Scraping da qdmnotizie.it - WordPress / Zox News."""
    print("[*] Scraping qdmnotizie.it...")
    html = fetch_html("https://www.qdmnotizie.it")
    if not html:
        return []
    
    # Cerca articoli nella homepage - pattern Zox News: class="mvp-blog-story-text" o simili
    # Estrai titoli da h2 dentro articoli
    articles_raw = re.findall(
        r'<h2[^>]*>\s*<a\s+href="([^"]+)"[^>]*>(.*?)</a>\s*</h2>',
        html, re.DOTALL | re.IGNORECASE
    )
    
    # Anche pattern alternativo: class="mvp-feat1-list-text" etc.
    if not articles_raw:
        articles_raw = re.findall(
            r'<a\s+href="(https://www\.qdmnotizie\.it/[^"]+)"[^>]*class="[^"]*mvp-feat[^"]*"[^>]*>(.*?)</a>',
            html, re.DOTALL | re.IGNORECASE
        )
    
    results = []
    seen_titles = set()
    for url, title_raw in articles_raw[:12]:
        title = re.sub(r"<[^>]+>", "", title_raw).strip()
        title = re.sub(r"\s+", " ", title)
        if not title or len(title) < 25 or title in seen_titles:
            continue
        seen_titles.add(title)
        
        date_str = estrai_data_da_testo(url)
        
        results.append({
            "title": title,
            "url": url,
            "source": "QDM Notizie",
            "date": date_str,
            "category": categorizza(title),
        })
    
    print(f"  [+] Trovati {len(results)} articoli")
    return results


def scrape_centropagina():
    """Scraping da centropagina.it."""
    print("[*] Scraping centropagina.it...")
    html = fetch_html("http://www.centropagina.it")
    if not html:
        return []
    
    # Pattern generico: cerca titoli in h2/h3 dentro link
    articles_raw = re.findall(
        r'<h[23][^>]*>\s*<a\s+href="([^"]+)"[^>]*>(.*?)</a>\s*</h[23]>',
        html, re.DOTALL | re.IGNORECASE
    )
    
    results = []
    seen_titles = set()
    for url, title_raw in articles_raw[:10]:
        title = re.sub(r"<[^>]+>", "", title_raw).strip()
        title = re.sub(r"\s+", " ", title)
        if not title or len(title) < 20 or title in seen_titles:
            continue
        seen_titles.add(title)
        
        date_str = datetime.now(TZ).strftime("%Y-%m-%d")
        
        results.append({
            "title": title,
            "url": url if url.startswith("http") else "http://www.centropagina.it" + url,
            "source": "Centro Pagina",
            "date": date_str,
            "category": categorizza(title),
        })
    
    print(f"  [+] Trovati {len(results)} articoli")
    return results


def scrape_leggopassword():
    """Scraping da leggopassword.it."""
    print("[*] Scraping leggopassword.it...")
    html = fetch_html("http://www.leggopassword.it")
    if not html:
        return []
    
    # Pattern generico
    articles_raw = re.findall(
        r'<h[23][^>]*>\s*<a\s+href="([^"]+)"[^>]*>(.*?)</a>\s*</h[23]>',
        html, re.DOTALL | re.IGNORECASE
    )
    
    if not articles_raw:
        # Proviamo a prendere qualsiasi link con titolo ragionevole
        articles_raw = re.findall(
            r'<a\s+href="([^"]+)"[^>]*title="([^"]+)"',
            html, re.IGNORECASE
        )
    
    results = []
    seen_titles = set()
    for url, title_raw in articles_raw[:10]:
        title = re.sub(r"<[^>]+>", "", title_raw).strip()
        title = re.sub(r"\s+", " ", title)
        if not title or len(title) < 20 or title in seen_titles:
            continue
        seen_titles.add(title)
        
        results.append({
            "title": title,
            "url": url if url.startswith("http") else "http://www.leggopassword.it" + url,
            "source": "Leggo Password",
            "date": datetime.now(TZ).strftime("%Y-%m-%d"),
            "category": categorizza(title),
        })
    
    print(f"  [+] Trovati {len(results)} articoli")
    return results


def scrape_vocedellavallesina():
    """Scraping da vocedellavallesina.it."""
    print("[*] Scraping vocedellavallesina.it...")
    html = fetch_html("http://www.vocedellavallesina.it")
    if not html:
        return []
    
    articles_raw = re.findall(
        r'<h[23][^>]*>\s*<a\s+href="([^"]+)"[^>]*>(.*?)</a>\s*</h[23]>',
        html, re.DOTALL | re.IGNORECASE
    )
    
    results = []
    seen_titles = set()
    for url, title_raw in articles_raw[:10]:
        title = re.sub(r"<[^>]+>", "", title_raw).strip()
        title = re.sub(r"\s+", " ", title)
        if not title or len(title) < 20 or title in seen_titles:
            continue
        seen_titles.add(title)
        
        results.append({
            "title": title,
            "url": url if url.startswith("http") else "http://www.vocedellavallesina.it" + url,
            "source": "Voce della Vallesina",
            "date": datetime.now(TZ).strftime("%Y-%m-%d"),
            "category": categorizza(title),
        })
    
    print(f"  [+] Trovati {len(results)} articoli")
    return results


def load_existing_articles():
    """Carica articles.json esistente."""
    if ARTICLES_JSON.exists():
        with open(ARTICLES_JSON, encoding="utf-8") as f:
            return json.load(f)
    return {"meta": {}, "articles": [], "prices": []}


def merge_articles(existing, new_articles):
    """Unisce nuovi articoli evitando duplicati per titolo."""
    existing_titles = {a.get("title", "").lower().strip() for a in existing.get("articles", [])}
    next_id = len(existing.get("articles", [])) + 1
    
    for art in new_articles:
        title_clean = art.get("title", "").lower().strip()
        if title_clean in existing_titles:
            continue
        existing_titles.add(title_clean)
        
        existing["articles"].append({
            "id": str(next_id),
            "title": art["title"],
            "date": art.get("date", datetime.now(TZ).strftime("%Y-%m-%d")),
            "category": art.get("category", "Attualità"),
            "source": art.get("source", ""),
            "abstract": art.get("abstract", ""),
        })
        next_id += 1
    
    return existing


def main():
    print()
    print("=" * 60)
    print("  Jesi News - Scraper Automatico")
    print("=" * 60)
    print()
    
    dry_run = "--dry-run" in sys.argv
    
    # Raccogli articoli da tutte le fonti
    all_new = []
    all_new.extend(scrape_viverejesi())
    all_new.extend(scrape_qdmnotizie())
    all_new.extend(scrape_centropagina())
    all_new.extend(scrape_leggopassword())
    all_new.extend(scrape_vocedellavallesina())
    
    print()
    print(f"[*] Totale nuovi articoli trovati: {len(all_new)}")
    
    if dry_run:
        print("\n[Dry run] Anteprima:")
        for a in all_new[:20]:
            print(f"  [{a.get('source','?')}] {a.get('title','')[:80]}")
        return
    
    # Unisci con esistente
    data = load_existing_articles()
    meta = data.get("meta", {})
    meta.update({
        "title": "Jesi - Notizie dalla Città",
        "date": datetime.now(TZ).strftime("%Y-%m-%d"),
        "generated_at": datetime.now(TZ).isoformat(),
        "source_file": "scrape_news.py (multi-source)"
    })
    data["meta"] = meta
    
    data = merge_articles(data, all_new)
    
    # Salva
    with open(ARTICLES_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"[OK] Salvati {len(data['articles'])} articoli totali in {ARTICLES_JSON}")
    print(f"[OK] Completato!")


if __name__ == "__main__":
    main()