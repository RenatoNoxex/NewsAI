/* ============================================================
   Jesi News - JavaScript Application
   ============================================================ */

// ── CONFIG ──────────────────────────────────────────────────
const DATA_URL = 'data/articles.json';
const ARTICLES_PER_PAGE = 12;

const CATEGORIES = [
  { id: 'urbanistica', name: 'Urbanistica', emoji: '🏗️', color: '#8E44AD' },
  { id: 'cultura', name: 'Cultura', emoji: '🎭', color: '#2980B9' },
  { id: 'sport', name: 'Sport', emoji: '⚽', color: '#27AE60' },
  { id: 'sociale', name: 'Sociale', emoji: '🤝', color: '#E67E22' },
  { id: 'attualita', name: 'Attualità', emoji: '📰', color: '#C0392B' },
];

const CATEGORY_MAP = {};
CATEGORIES.forEach(c => { CATEGORY_MAP[c.name.toLowerCase()] = c; });
// Also map by id
CATEGORIES.forEach(c => { CATEGORY_MAP[c.id] = c; });

const CAT_ORDER = ['Urbanistica', 'Cultura', 'Sport', 'Sociale', 'Attualità'];

// ── STATE ───────────────────────────────────────────────────
let allData = null;
let articles = [];
let currentCategory = null;
let selectedDate = null;
let availableDates = [];

// ── DOM REFS ───────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    allData = await resp.json();
    articles = allData.articles || [];

    // Calcola date disponibili (decrescente)
    const dateSet = new Set(articles.map(a => a.date).filter(Boolean));
    availableDates = [...dateSet].sort().reverse();

    // Default: ultimo giorno
    if (availableDates.length > 0) {
      selectedDate = availableDates[0];
    }

    const page = document.body.dataset.page;

    if (page === 'home') {
      renderHome();
    } else if (page === 'article') {
      renderArticle();
    } else if (page === 'category') {
      renderCategoryPage();
    } else if (page === 'admin') {
      initAdmin();
      showDbStatus();
    }

    const badge = document.getElementById('date-badge');
    if (badge && allData.meta) {
      const d = allData.meta.date || '';
      badge.textContent = d ? d.replace(/-/g, '/') : '';
    }

    if (currentCategory) {
      const navLinks = $$('.category-nav a');
      navLinks.forEach(a => {
        if (a.dataset.cat === currentCategory) a.classList.add('active');
      });
    }
  } catch (err) {
    console.error('Failed to load data:', err);
    const container = document.querySelector('.container');
    if (container) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;">
          <div style="font-size:64px;margin-bottom:20px;">⚠️</div>
          <h2>Errore di caricamento</h2>
          <p style="color:#666;margin-top:10px;">Impossibile caricare i dati. Verifica che il file articles.json sia presente.</p>
        </div>
      `;
    }
  }
}

// ── DATE NAVIGATOR ─────────────────────────────────────────
function renderDateNavigator(container, dates, selected, onChange) {
  if (!container || !dates.length) return;

  let html = `<div class="date-navigator">`;
  html += `<div class="date-nav-inner">`;

  dates.forEach(date => {
    const parts = date.split('-');
    const label = `${parts[2]}/${parts[1]}`;
    const dayName = getDayName(date);
    const active = date === selected ? 'active' : '';
    const isLatest = date === availableDates[0];
    html += `<button class="date-btn ${active}" data-date="${date}" title="${formatDate(date)}">
      <span class="date-dayname">${dayName}</span>
      <span class="date-num">${label}</span>
      ${isLatest ? '<span class="date-latest">Ultimo</span>' : ''}
    </button>`;
  });

  html += `</div></div>`;
  container.innerHTML = html;

  container.querySelectorAll('.date-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date;
      if (date && onChange) onChange(date);
    });
  });
}

function getDayName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const giorni = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  return giorni[d.getDay()];
}

// ── HOME PAGE ───────────────────────────────────────────────
function renderHome() {
  if (!articles.length) return;

  const main = $('#main-content');
  if (!main) return;

  // Raggruppa per data
  const byDate = {};
  articles.forEach(a => {
    if (!a.date) return;
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });

  const dateKeys = Object.keys(byDate).sort().reverse();

  // Data da mostrare: selectedDate o la più recente
  const dateToShow = (selectedDate && byDate[selectedDate]) ? selectedDate : dateKeys[0];

  // Navigatore date con TUTTE le date disponibili
  const navContainer = document.getElementById('date-nav');
  if (navContainer) {
    renderDateNavigator(navContainer, dateKeys, dateToShow, (date) => {
      selectedDate = date;
      renderHome();
    });
  }

  let html = '';

  // HERO: primo articolo del giorno selezionato
  const dayArticles = byDate[dateToShow] || [];
  if (dayArticles.length > 0) {
    const hero = dayArticles[0];
    const catInfo = CATEGORY_MAP[hero.category.toLowerCase()] || {};
    html += `
      <article class="hero-article">
        <div class="hero-content">
          <span class="cat-badge" style="background:${catInfo.color || '#C0392B'}">${catInfo.emoji || ''} ${hero.category}</span>
          <h1><a href="article.html?id=${hero.id}">${escapeHtml(hero.title)}</a></h1>
          <p>${escapeHtml(hero.abstract)}</p>
          <div class="hero-meta">
            <span>📅 ${formatDate(hero.date)}</span>
            <span>📰 ${escapeHtml(hero.source || 'Fonte sconosciuta')}</span>
          </div>
        </div>
      </article>
    `;
  }

  // Intestazione giorno selezionato
  const parts = dateToShow.split('-');
  const dateLabel = `${parts[2]}/${parts[1]}/${parts[0]}`;
  const dayName = getDayName(dateToShow);
  const totalDay = dayArticles.length;

  html += `<section class="day-block">`;
  html += `
    <div class="day-header">
      <div class="day-title">
        <span class="day-badge">${dayName}</span>
        <h2>${dateLabel}</h2>
        <span class="day-count">${totalDay} articoli</span>
      </div>
    </div>
  `;

  // Raggruppa per categoria
  const byCat = {};
  dayArticles.forEach(a => {
    const cat = a.category || 'Altro';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(a);
  });

  // Mostra ogni categoria con i suoi articoli
  CAT_ORDER.forEach(catName => {
    const catArticles = byCat[catName] || [];
    if (!catArticles.length) return;

    const catInfo = CATEGORY_MAP[catName.toLowerCase()] || {};

    html += `<div class="category-mini-header">
      <span class="cat-dot" style="background:${catInfo.color || '#C0392B'}"></span>
      <strong>${catInfo.emoji || ''} ${catName}</strong>
      <span class="cat-count">${catArticles.length}</span>
      <a href="category.html?cat=${catName.toLowerCase()}" style="margin-left:auto;font-size:12px;color:#C0392B;text-decoration:none;font-weight:600;">Tutte →</a>
    </div>`;
    html += `<div class="news-grid">`;

    catArticles.forEach(article => {
      html += renderCard(article, catInfo);
    });

    html += `</div>`;
  });

  html += `</section>`;

  main.innerHTML = html;
}

// ── CATEGORY PAGE ───────────────────────────────────────────
function renderCategoryPage() {
  const params = new URLSearchParams(window.location.search);
  const catSlug = params.get('cat');
  currentCategory = catSlug;

  const main = $('#main-content');
  if (!main) return;

  // Find category info - try by id first, then by name match
  let catName = catSlug ? catSlug.charAt(0).toUpperCase() + catSlug.slice(1) : '';
  const found = CATEGORIES.find(c => c.id === catSlug);
  if (found) catName = found.name;

  let catInfo = CATEGORY_MAP[catSlug] || null;
  if (!catInfo) {
    // Try matching by category name (case insensitive)
    const match = CATEGORIES.find(c => c.name.toLowerCase() === catSlug.toLowerCase());
    if (match) catInfo = match;
  }

  const catArticles = articles.filter(a => {
    const articleCat = (a.category || '').toLowerCase();
    const slugLower = (catSlug || '').toLowerCase();
    return articleCat === slugLower;
  });

  if (!catArticles.length) {
    main.innerHTML = `<div style="text-align:center;padding:60px;"><h2>Nessun articolo trovato per "${catName}"</h2></div>`;
    return;
  }

  document.title = `${catName} - Jesi News`;
  const titleEl = $('#page-title');
  if (titleEl) titleEl.textContent = `${catInfo?.emoji || ''} ${catName} (${catArticles.length} totali)`;

  // Raggruppa per data
  const byDate = {};
  catArticles.forEach(a => {
    if (!a.date) return;
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });

  const dateKeys = Object.keys(byDate).sort().reverse();

  // Data da mostrare
  const dateToShow = (selectedDate && byDate[selectedDate]) ? selectedDate : dateKeys[0];

  // Navigatore
  const navContainer = document.getElementById('date-nav');
  if (navContainer && dateKeys.length > 1) {
    renderDateNavigator(navContainer, dateKeys, dateToShow, (date) => {
      selectedDate = date;
      renderCategoryPage();
    });
  }

  let html = '';

  const dayArticles = byDate[dateToShow] || [];
  if (dayArticles.length === 0) {
    main.innerHTML = `<div style="text-align:center;padding:60px;"><h2>Nessun articolo per ${formatDate(dateToShow)}</h2></div>`;
    return;
  }

  const parts = dateToShow.split('-');
  const dateLabel = `${parts[2]}/${parts[1]}/${parts[0]}`;
  const dayName = getDayName(dateToShow);

  html += `<div class="day-header" style="margin-top:20px;">
    <div class="day-title">
      <span class="day-badge">${dayName}</span>
      <h3>${dateLabel}</h3>
      <span class="day-count">${dayArticles.length} articoli</span>
    </div>
  </div>`;
  html += `<div class="news-grid">`;

  dayArticles.forEach(article => {
    html += renderCard(article, catInfo);
  });

  html += `</div>`;

  main.innerHTML = html;
}

// ── ARTICLE DETAIL PAGE ──────────────────────────────────────
function renderArticle() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  const main = $('#main-content');
  if (!main) return;

  if (!id) {
    main.innerHTML = `<div style="text-align:center;padding:60px;"><h2>Articolo non trovato</h2><p style="color:#666;">Nessun ID specificato.</p></div>`;
    return;
  }

  const article = articles.find(a => a.id === id);

  if (!article) {
    main.innerHTML = `<div style="text-align:center;padding:60px;"><h2>Articolo non trovato</h2><p style="color:#666;">L'articolo con ID "${id}" non esiste.</p></div>`;
    return;
  }

  let catInfo = CATEGORY_MAP[article.category.toLowerCase()] || {};
  if (!catInfo || !catInfo.color) {
    // Try matching by name
    const match = CATEGORIES.find(c => c.name.toLowerCase() === (article.category || '').toLowerCase());
    if (match) catInfo = match;
  }

  document.title = `${article.title} - Jesi News`;

  const html = `
    <a href="javascript:history.back()" class="back-link">← Torna alle news</a>
    <article class="article-detail">
      <div class="article-detail-header">
        <span class="cat-badge" style="background:${catInfo.color || '#C0392B'}">${catInfo.emoji || ''} ${article.category}</span>
        <h1>${escapeHtml(article.title)}</h1>
        <div class="meta">
          <span>📅 ${formatDate(article.date)}</span>
          <span>📰 ${escapeHtml(article.source || 'Fonte sconosciuta')}</span>
        </div>
      </div>
      <div class="article-detail-body">
        <div class="abstract">
          ${escapeHtml(article.abstract)}
        </div>
        <div class="full-content">
          <p>${escapeHtml(article.content)}</p>
          ${article.url ? `<p><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener" style="color:#C0392B;font-weight:600;">Leggi la fonte originale →</a></p>` : ''}
        </div>
        <div class="article-source-box">
          <div>
            <div class="label">Fonte</div>
            <div class="source-name">${escapeHtml(article.source || 'Fonte sconosciuta')}</div>
          </div>
          ${article.url ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener" style="background:#C0392B;color:white;padding:8px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Visita</a>` : ''}
        </div>
      </div>
    </article>
  `;

  main.innerHTML = html;
}

// ── RENDER CARD ──────────────────────────────────────────────
function renderCard(article, catInfo) {
  catInfo = catInfo || CATEGORY_MAP[article.category.toLowerCase()] || {};
  return `
    <div class="news-card" onclick="window.location='article.html?id=${article.id}'">
      <div class="card-body">
        <span class="cat-badge" style="background:${catInfo.color || '#C0392B'}">${catInfo.emoji || ''} ${article.category}</span>
        <h3><a href="article.html?id=${article.id}">${escapeHtml(article.title)}</a></h3>
        <div class="excerpt">${escapeHtml(article.abstract)}</div>
        <div class="card-footer">
          <span>📅 ${formatDate(article.date)}</span>
          <span class="source">${escapeHtml(article.source || '')}</span>
        </div>
      </div>
    </div>
  `;
}

// ── ADMIN PAGE ──────────────────────────────────────────────
function initAdmin() {
  const uploadBtn = $('#upload-btn');
  const fileInput = $('#file-input');
  const uploadArea = $('#upload-area');

  if (!uploadBtn || !fileInput) return;

  uploadBtn.addEventListener('click', () => fileInput.click());

  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
      }
    });
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleFile(e.target.files[0]);
    }
  });
}

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showResult('❌ Per favore seleziona un file PDF.', false);
    return;
  }
  showResult(`
    ✅ File ricevuto: <strong>${file.name}</strong><br><br>
    <b>Istruzioni:</b><br>
    1. Copia il file PDF nella cartella del progetto<br>
    2. Esegui: <code>python scripts/parse_report.py "${file.name}"</code><br>
    3. Ricarica la pagina per vedere le nuove news
  `, true);
}

function showDbStatus() {
  const el = document.getElementById('db-status');
  if (!el) return;
  if (!allData) {
    el.textContent = '⚠️ Database non caricato';
    return;
  }
  const total = articles.length;
  const cats = [...new Set(articles.map(a => a.category))].sort();

  const byDate = {};
  articles.forEach(a => {
    if (!a.date) return;
    byDate[a.date] = (byDate[a.date] || 0) + 1;
  });
  const dateKeys = Object.keys(byDate).sort().reverse();
  const giorniCoperti = dateKeys.length;

  el.innerHTML = `
    <strong>${total}</strong> articoli in <strong>${cats.length}</strong> categorie<br>
    <span style="font-size:13px;color:#999;">
      📅 ${giorniCoperti} giorni coperti ·
      Ultimo: ${dateKeys[0] || '?'} ·
    </span>
    <span style="font-size:13px;color:#999;">
      Categorie: ${cats.join(', ')}
    </span>
  `;
}

function showResult(msg, isSuccess) {
  const el = $('#upload-result');
  if (!el) return;
  el.className = 'upload-result ' + (isSuccess ? 'success' : 'error');
  el.innerHTML = msg;
  el.style.display = 'block';
}

// ── UTILITY ──────────────────────────────────────────────────
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}