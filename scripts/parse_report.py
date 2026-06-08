#!/usr/bin/env python3
"""
Jesi News - Parse PDF report da fonte giornaliera
==================================================
Estrae articoli dal PDF giornaliero e aggiorna articles.json.

Struttura PDF attesa:
    [SEZIONE 1: Urbanistica]
    Titolo articolo 1
    Testo descrittivo...
    [Fonte: ...]

    [SEZIONE 2: Cultura]
    ...

Uso:
    python scripts/parse_report.py <path-to-pdf> [-o output.json]
"""

import re
import json
import sys
import os
from datetime import datetime

# ── Sezioni del report ──────────────────────────────────────
SECTION_NAMES = {
    "Urbanistica": "Urbanistica",
    "Cultura": "Cultura",
    "Sport": "Sport",
    "Sociale": "Sociale",
    "Attualità": "Attualità",
    "Attualita": "Attualità",
    "Panoramica": "Attualità",
    "Panoramica Globale": "Attualità",
}

# Pattern per matching flessibile delle sezioni
SECTION_PATTERNS = [
    (r"Urbanistica", "Urbanistica"),
    (r"Cultura", "Cultura"),
    (r"Sport", "Sport"),
    (r"Sociale", "Sociale"),
    (r"Attualit[\wà]+", "Attualità"),
    (r"Panoramica\s+Globale", "Attualità"),
    (r"Panoramica", "Attualità"),
]

SECTION_EMOJI = {
    "Urbanistica": "🏗️",
    "Cultura": "🎭",
    "Sport": "⚽",
    "Sociale": "🤝",
    "Attualità": "📰",
}

def extract_report_date(text: str) -> str:
    """Extract the report date from the first lines."""
    m = re.search(r'(\d{2}/\d{2}/\d{4})', text)
    if m:
        parts = m.group(1).split('/')
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    # fallback: try "2026-06-08" style
    m2 = re.search(r'(\d{4}-\d{2}-\d{2})', text)
    if m2:
        return m2.group(1)
    return datetime.now().strftime("%Y-%m-%d")

def extract_reports(text: str):
    """
    Parse the full text and return:
      - meta dict with date, title
      - list of article dicts
    """
    lines = text.split('\n')
    
    # Find report title
    title = "Report Jesi News"
    date = extract_report_date(text)
    
    # Find section boundaries
    sections = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Exact match for model sections
        if stripped in SECTION_NAMES:
            sections.append((SECTION_NAMES[stripped], i))
            continue
        
        # Pattern matching
        for pattern, name in SECTION_PATTERNS:
            if re.search(r'^\s*' + pattern + r'\s*$', stripped, re.IGNORECASE):
                sections.append((name, i))
                break
    
    # Also check for headers with colon: "Urbanistica:"
    for i, line in enumerate(lines):
        stripped = line.strip()
        m = re.match(r'(Urbanistica|Cultura|Sport|Sociale|Attualit[\wà]+|Panoramica)\s*:', stripped)
        if m:
            cat_name = m.group(1)
            if cat_name in SECTION_NAMES:
                sections.append((SECTION_NAMES[cat_name], i))
            elif cat_name.startswith("Attualit"):
                sections.append(("Attualità", i))
    
    # Deduplicate consecutive sections with same name
    deduped = []
    for sec in sections:
        if not deduped or deduped[-1][0] != sec[0]:
            deduped.append(sec)
    sections = deduped
    
    # Add a sentinel at end
    sections.append(("END", len(lines)))
    
    articles = []
    
    for idx in range(len(sections) - 1):
        section_name = sections[idx][0]
        start = sections[idx][1] + 1
        end = sections[idx + 1][1]
        
        section_lines = lines[start:end]
        
        section_articles = parse_articles_in_section(section_lines, section_name, date)
        articles.extend(section_articles)
    
    return {
        "meta": {
            "title": title,
            "date": date,
            "generated_at": datetime.now().isoformat(),
            "source_file": "report"
        },
        "articles": articles,
        "prices": []
    }

def parse_articles_in_section(lines, section_name, report_date):
    """Parse articles from a section's lines."""
    articles = []
    current_article = None
    article_text_lines = []
    
    for line in lines:
        stripped = line.strip()
        
        # Skip empty lines at start of article
        if not stripped and current_article is None:
            continue
        
        # Detect article title: line that is not a source and not empty
        if current_article is None and stripped and not stripped.startswith('[') and not stripped.startswith('-') and not stripped.startswith('*'):
            if len(stripped) > 15 and not stripped.startswith('http'):
                current_article = {
                    "id": None,  # will assign later
                    "title": stripped,
                    "category": section_name,
                    "date": report_date,
                    "abstract": "",
                    "content": "",
                    "source": ""
                }
                article_text_lines = []
            continue
        
        if current_article:
            # Check for source line: [Fonte: ...]
            src_match = re.match(r'\[Fonte:\s*(.+?)\]', stripped)
            if src_match:
                current_article["source"] = src_match.group(1).strip()
                if article_text_lines:
                    current_article["abstract"] = ' '.join(article_text_lines).strip()
                articles.append(current_article)
                current_article = None
                article_text_lines = []
                continue
            
            # Skip separator lines
            if stripped.startswith('---') or stripped.startswith('==='):
                if article_text_lines:
                    current_article["abstract"] = ' '.join(article_text_lines).strip()
                if current_article:
                    articles.append(current_article)
                current_article = None
                article_text_lines = []
                continue
            
            # Check if this is a new title (next article started without source)
            if stripped and len(stripped) > 15 and not stripped.startswith('http') and not stripped.startswith('·') and not stripped.startswith('-') and article_text_lines:
                if current_article:
                    if article_text_lines:
                        current_article["abstract"] = ' '.join(article_text_lines).strip()
                    if current_article["source"] or current_article["abstract"]:
                        articles.append(current_article)
                
                current_article = {
                    "id": None,
                    "title": stripped,
                    "category": section_name,
                    "date": report_date,
                    "abstract": "",
                    "content": "",
                    "source": ""
                }
                article_text_lines = []
                continue
            
            # Accumulate text
            if stripped:
                article_text_lines.append(stripped)
    
    # Don't forget the last article
    if current_article:
        if article_text_lines:
            current_article["abstract"] = ' '.join(article_text_lines).strip()
        if current_article["source"] or current_article["abstract"]:
            articles.append(current_article)
    
    return articles

def assign_ids(articles):
    """Assign unique IDs to articles based on category and index."""
    category_counters = {}
    for i, article in enumerate(articles):
        cat = article.get("category", "unknown").lower()
        # Normalize "attualità" to "attualita" for IDs
        cat = cat.replace("à", "a").replace("è", "e").replace("ì", "i").replace("ò", "o").replace("ù", "u")
        category_counters.setdefault(cat, 0)
        category_counters[cat] += 1
        article["id"] = f"{cat}-{category_counters[cat]}"
    
    # Also add a sequential index
    for i, article in enumerate(articles):
        article["index"] = i
    
    return articles

def merge_with_existing(new_data, existing_path):
    """Merge new articles with existing ones, avoiding duplicates by title."""
    if not os.path.exists(existing_path):
        return new_data
    
    try:
        with open(existing_path, 'r', encoding='utf-8') as f:
            existing = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return new_data
    
    existing_titles = {a["title"] for a in existing.get("articles", [])}
    
    for article in new_data.get("articles", []):
        if article["title"] not in existing_titles:
            existing.setdefault("articles", []).append(article)
            existing_titles.add(article["title"])
    
    # Update meta
    existing["meta"] = new_data.get("meta", existing.get("meta", {}))
    
    return existing

def parse_pdf_text(filepath: str) -> str:
    """Try to extract text from a PDF file using available tools."""
    import subprocess
    # Try pdftotext first
    try:
        result = subprocess.run(
            ["pdftotext", filepath, "-"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    # Fallback: try PyMuPDF
    try:
        import fitz
        doc = fitz.open(filepath)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except ImportError:
        pass
    
    # Fallback: try pdfminer
    try:
        from pdfminer.high_level import extract_text
        return extract_text(filepath)
    except ImportError:
        pass
    
    # Last fallback: read as raw and try to extract text
    with open(filepath, 'rb') as f:
        raw = f.read()
    
    text = raw.decode('utf-8', errors='ignore')
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    return text


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/parse_report.py <path-to-pdf> [-o output.json]")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    
    # Determine output path
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "articles.json")
    if "-o" in sys.argv:
        idx = sys.argv.index("-o")
        if idx + 1 < len(sys.argv):
            output_path = sys.argv[idx + 1]
    
    print(f"--- Parsing: {pdf_path}")
    text = parse_pdf_text(pdf_path)
    
    if not text.strip():
        print("ERROR: Could not extract text from PDF")
        sys.exit(1)
    
    print(f"TEXT: Extracted {len(text)} characters")
    
    data = extract_reports(text)
    data["articles"] = assign_ids(data["articles"])
    
    # Merge with existing if any
    if os.path.exists(output_path):
        data = merge_with_existing(data, output_path)
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"OK: Saved {len(data['articles'])} articles to {output_path}")
    print(f"   Categories: {set(a['category'] for a in data['articles'])}")

if __name__ == "__main__":
    main()