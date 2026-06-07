#!/usr/bin/env node
/**
 * NewsAI — Daily AI Model Intelligence Report Generator
 *
 * Searches the web via Brave Search API for updates on specific AI models
 * (DeepSeek, Kimi, Qwen, Claude, Gemini) plus a panoramic overview,
 * then produces a styled HTML report ready for Google Docs.
 *
 * Usage:
 *   node generate-report.js            — normal run
 *   node generate-report.js --serve    — generate + start web server
 *   node generate-report.js --now      — ignore cache, always fetch fresh
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(__dirname, "config.json");
let CONFIG;

function loadConfig() {
  // GitHub Actions / cloud mode: read from environment variables
  if (process.env.BRAVE_API_KEY) {
    CONFIG = {
      braveSearch: {
        apiKey: process.env.BRAVE_API_KEY,
        baseUrl: "https://api.search.brave.com/res/v1/web/search",
        maxResultsPerQuery: 10,
      },
      report: {
        outputDir: "./reports",
        outputFile: "report-ai.html",
      },
      targets: getDefaultTargets(),
    };
    console.log("Using environment variable BRAVE_API_KEY (cloud mode)");
    return;
  }

  // Local mode: read from config.json
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("Config file not found. Set BRAVE_API_KEY env var or create config.json");
    process.exit(1);
  }
  CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function getDefaultTargets() {
  return {
    deepseek: {
      name: "DeepSeek",
      queries: [
        "DeepSeek V4 Pro AI model update release 2026",
        "DeepSeek V4 Flash update news 2026",
      ],
    },
    kimi: {
      name: "Kimi",
      queries: [
        "Kimi 2.6 Moonshot AI model update release 2026",
        "Kimi K2.6 coding agent benchmark 2026",
      ],
    },
    qwen: {
      name: "Qwen (Alibaba)",
      queries: [
        "Qwen Alibaba AI model update 2026 latest news",
        "Qwen 3.7 Max benchmark coding 2026",
      ],
    },
    claude: {
      name: "Claude (Anthropic)",
      queries: [
        "Claude 4 Anthropic release update June 2026",
        "Claude Opus 4.8 Sonnet 4.6 benchmark 2026",
      ],
    },
    gemini: {
      name: "Gemini (Google)",
      queries: [
        "Google Gemini AI model update release June 2026",
        "Gemini 3.5 Flash Pro benchmark 2026",
      ],
    },
    panoramic: {
      name: "Panoramica Globale",
      queries: [
        "AI model release benchmark news June 5 2026",
        "OpenAI Meta Llama Mistral AI model news June 2026",
        "new AI startup model release 2026 frontier",
      ],
    },
  };
}

function todayItalian() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return dd + "/" + mm + "/" + yyyy;
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// HTML entity encoding
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  var s = String(str);
  // Use char codes to prevent formatter from converting entities
  var a = String.fromCharCode(38);
  s = s.split(a).join(a + "amp;");
  s = s.split("<").join(a + "lt;");
  s = s.split(">").join(a + "gt;");
  s = s.split('"').join(a + "quot;");
  return s;
}

// ---------------------------------------------------------------------------
// Brave Search API call
// ---------------------------------------------------------------------------

function braveSearch(query) {
  return new Promise(function (resolve, reject) {
    var apiKey = CONFIG.braveSearch.apiKey;
    var maxResults = CONFIG.braveSearch.maxResultsPerQuery || 10;
    var params = new URLSearchParams({ q: query, count: maxResults });
    var url = CONFIG.braveSearch.baseUrl + "?" + params.toString();

    var options = {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
    };

    https
      .get(url, options, function (res) {
        var chunks = [];
        var stream = res;

        // Handle gzip/deflate compression
        var encoding = res.headers["content-encoding"];
        if (encoding === "gzip") {
          var gunzip = zlib.createGunzip();
          res.pipe(gunzip);
          stream = gunzip;
        } else if (encoding === "deflate") {
          var inflate = zlib.createInflate();
          res.pipe(inflate);
          stream = inflate;
        }

        stream.on("data", function (chunk) {
          chunks.push(chunk);
        });
        stream.on("end", function () {
          try {
            var data = Buffer.concat(chunks).toString("utf-8");
            var json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(new Error("JSON parse error: " + e.message));
          }
        });
        stream.on("error", function (err) {
          reject(err);
        });
      })
      .on("error", function (err) {
        reject(err);
      });
  });
}

function extractResults(apiResponse) {
  // Check for API-level errors
  if (apiResponse && apiResponse.error) {
    var errMsg = apiResponse.error.message || JSON.stringify(apiResponse.error);
    console.error("    ⚠️  Brave API error: " + errMsg);
    if (apiResponse.error.code === "SUBSCRIPTION_TOKEN_INVALID") {
      console.error("    💡 The API key seems invalid or expired. Get a free key at https://brave.com/search/api/");
    }
    return [];
  }
  if (!apiResponse || !apiResponse.web || !apiResponse.web.results) {
    // Log raw response type to help debugging
    var respType = apiResponse ? Object.keys(apiResponse).join(", ") : "null/undefined";
    console.error("    ⚠️  Unexpected API response. Type keys: " + respType);
    return [];
  }
  return apiResponse.web.results.map(function (r) {
    return {
      title: (r.title || "").replace(/<[^>]*>/g, ""),
      description: (r.description || "").replace(/<[^>]*>/g, ""),
      url: r.url || "",
      source: extractSourceName(r.url || ""),
      age: r.age || "",
    };
  });
}

function extractSourceName(url) {
  try {
    var hostname = new URL(url).hostname.replace(/^www\./, "");
    var aliases = {
      "reuters.com": "Reuters",
      "techbriefly.com": "TechBriefly",
      "huggingface.co": "Hugging Face",
      "build.nvidia.com": "NVIDIA",
      "deepseek.ai": "DeepSeek Blog",
      "api-docs.deepseek.com": "DeepSeek API Docs",
      "nist.gov": "NIST",
      "atlascloud.ai": "Atlas Cloud",
      "framia.converge.ai": "Converge AI",
      "kimi-k2.org": "Kimi K2 Blog",
      "deepinfra.com": "DeepInfra",
      "marktechpost.com": "MarkTechPost",
      "miraflow.ai": "MiraFlow",
      "latent.space": "Latent Space",
      "moonshot.ai": "Moonshot AI",
      "verdent.ai": "Verdent Guides",
      "kili-technology.com": "Kili Technology",
      "reddit.com": "Reddit r/LocalLLM",
      "scmp.com": "South China Morning Post",
      "indiatoday.in": "India Today",
      "cnbc.com": "CNBC",
      "caixinglobal.com": "Caixin Global",
      "digitalapplied.com": "Digital Applied",
      "news.aibase.com": "AI Base News",
      "wikipedia.org": "Wikipedia",
      "anthropic.com": "Anthropic",
      "platform.claude.com": "Claude API Docs",
      "releasebot.io": "ReleaseBot",
      "blog.mean.ceo": "Mean CEO Blog",
      "scriptbyai.com": "ScriptByAI",
      "edtechinnovationhub.com": "EdTech Innovation Hub",
      "developers.make.com": "Make Developer Hub",
      "hidekazu-konishi.com": "Hidekazu Konishi",
      "ai.google.dev": "Google AI Dev",
      "blog.google": "Google Blog",
      "mashable.com": "Mashable",
      "theverge.com": "The Verge",
      "docs.cloud.google.com": "Google Cloud Docs",
      "developers.google.com": "Google Dev",
      "llm-stats.com": "LLM Stats",
      "pricepertoken.com": "Price Per Token",
      "buildfastwithai.com": "Build Fast With AI",
      "radicaldatascience.wordpress.com": "Radical Data Science",
      "overchat.ai": "OverChat AI Hub",
      "aiflashreport.com": "AI Flash Report",
      "aiproductivity.ai": "AI Productivity",
      "aimlapi.com": "AI/ML API Blog",
      "theaitrack.com": "The AI Track",
      "ai.meta.com": "Meta AI",
      "mistral.ai": "Mistral AI",
      "featherless.ai": "Featherless",
      "intuitionlabs.ai": "IntuitionLabs",
      "rits.shanghai.nyu.edu": "NYU Shanghai",
      "lmcouncil.ai": "LM Council",
    };
    return aliases[hostname] || hostname;
  } catch (e) {
    return url.split("/")[2] || "Unknown";
  }
}

// ---------------------------------------------------------------------------
// Deduplicate results (by URL)
// ---------------------------------------------------------------------------

function deduplicate(results) {
  var seen = new Set();
  return results.filter(function (r) {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

function isRecentEnough(result) {
  var age = (result.age || "").toLowerCase();
  if (!age) return true;
  if (age.includes("hour") || age.includes("minute")) return true;
  if (age.includes("day")) {
    var match = age.match(/(\d+)\s*day/);
    var days = match ? parseInt(match[1], 10) : 0;
    return days <= 7;
  }
  if (age.includes("month") || age.includes("year")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Search a target: run queries, merge, deduplicate, filter
// ---------------------------------------------------------------------------

async function searchTarget(targetKey) {
  var target = CONFIG.targets[targetKey];
  if (!target) throw new Error("Target '" + targetKey + "' not found in config.");
  var allResults = [];
  for (var i = 0; i < target.queries.length; i++) {
    var query = target.queries[i];
    console.log("  Searching: \"" + query + "\"");
    var apiResp = await braveSearch(query);
    var results = extractResults(apiResp);
    console.log("    -> " + results.length + " results obtained");
    allResults.push.apply(allResults, results);
    await new Promise(function (r) {
      return setTimeout(r, 300);
    });
  }
  var filtered = deduplicate(allResults);
  filtered = filtered.filter(isRecentEnough);
  return filtered;
}

// ---------------------------------------------------------------------------
// HTML report builder
// ---------------------------------------------------------------------------

function renderSection(name, results) {
  if (!results || results.length === 0) {
    return [
      '<h2 style="color: #1e3a8a; font-family: Arial, sans-serif; margin-top: 25px;">',
      escapeHtml(name),
      '</h2>',
      '<p style="font-family: Arial, sans-serif; color: #555;">Nessun aggiornamento rilevante nelle ultime 24 ore.</p>',
    ].join("\n");
  }

  var items = "";
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var desc = r.description
      ? escapeHtml(r.description.slice(0, 300)) +
        (r.description.length > 300 ? "\u2026" : "")
      : "";
    var ageStr = r.age
      ? ' <span style="color:#888;font-size:0.9em;">(' +
        escapeHtml(r.age) +
        ")</span>"
      : "";
    items +=
      '\n      <li style="margin-bottom:12px; font-family: Arial, sans-serif;">\n        <strong>' +
      escapeHtml(r.title) +
      "</strong>" +
      ageStr +
      '<br>\n        <span style="color:#444;">' +
      desc +
      '</span><br>\n        <a href="' +
      escapeHtml(r.url) +
      '" style="color: #0047AB; text-decoration: none; font-weight: bold;" target="_blank">[Fonte: ' +
      escapeHtml(r.source) +
      "]</a>\n      </li>";
  }

  return [
    '<h2 style="color: #1e3a8a; font-family: Arial, sans-serif; margin-top: 25px;">',
    escapeHtml(name),
    '</h2>\n    <ul style="list-style-type: disc; padding-left: 20px;">',
    items,
    "\n    </ul>",
  ].join("");
}

function renderDataTable(title, rows) {
  if (!rows || rows.length === 0) return "";
  var headers = Object.keys(rows[0]);
  var headerRow = "";
  for (var i = 0; i < headers.length; i++) {
    headerRow +=
      '<th style="border:1px solid #ccc; padding:8px 12px; background:#f0f4ff; font-family:Arial,sans-serif;">' +
      escapeHtml(headers[i]) +
      "</th>";
  }
  var bodyRows = "";
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    bodyRows += "<tr>";
    for (var h = 0; h < headers.length; h++) {
      bodyRows +=
        '<td style="border:1px solid #ddd; padding:8px 12px; font-family:Arial,sans-serif;">' +
        escapeHtml(String(row[headers[h]] || "")) +
        "</td>";
    }
    bodyRows += "</tr>";
  }

  return [
    '<h3 style="font-family: Arial, sans-serif; color: #333; margin-top: 20px;">',
    escapeHtml(title),
    '</h3>\n    <table style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">\n      <thead>',
    headerRow,
    "</thead>\n      <tbody>",
    bodyRows,
    "</tbody>\n    </table>",
  ].join("");
}

function buildHtml(dateStr, sections, dataTables) {
  if (!dataTables) dataTables = [];
  var sectionsHtml = "";
  for (var i = 0; i < sections.length; i++) {
    sectionsHtml += renderSection(sections[i].name, sections[i].results);
    sectionsHtml += "\n";
  }
  var tablesHtml = "";
  for (var t = 0; t < dataTables.length; t++) {
    tablesHtml += renderDataTable(dataTables[t].title, dataTables[t].rows);
    tablesHtml += "\n";
  }
  var ts = new Date().toISOString().replace("T", " ").slice(0, 19);

  return [
    "<!DOCTYPE html>",
    '<html lang="it">',
    "<head>",
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "  <title>Report Aggiornamenti AI \u2014 " + dateStr + "</title>",
    "  <style>",
    "    body {",
    "      max-width: 900px;",
    "      margin: 40px auto;",
    "      padding: 20px 40px;",
    "      font-family: Arial, sans-serif;",
    "      color: #222;",
    "      background: #fff;",
    "      line-height: 1.7;",
    "    }",
    "    a:hover { text-decoration: underline !important; }",
    "    table { box-shadow: 0 1px 4px rgba(0,0,0,0.08); }",
    "    hr { border: none; border-top: 1px solid #ddd; margin: 30px 0; }",
    "    .footer { color: #999; font-size: 0.85em; margin-top: 40px; text-align: center; }",
    "  </style>",
    "</head>",
    "<body>",
    "",
    '<h1 style="color: #0047AB; font-family: Arial, sans-serif; border-bottom: 2px solid #0047AB; padding-bottom: 10px;">',
    "  \uD83D\uDCC5 Report Aggiornamenti AI \u2014 " + dateStr,
    "</h1>",
    "",
    '<p style="font-family: Arial, sans-serif; color: #555; font-size: 0.95em;">',
    "  Report di intelligence automatico generato il <strong>" + ts + " CET</strong>.",
    "  Fonti reali, ricerca sul web delle ultime 24 ore.",
    "</p>",
    "",
    sectionsHtml,
    tablesHtml,
    "",
    '<div class="footer">',
    "  <hr>",
    '  <p>\uD83E\uDD16 Report generato automaticamente da <strong>NewsAI Daily</strong> \u2014',
    '  <a href="https://github.com" style="color:#0047AB;">Documentazione</a> |',
    "  Generato: " + ts + "</p>",
    "</div>",
    "",
    "</body>",
    "</html>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  loadConfig();

  var dateStr = todayItalian();
  console.log("NewsAI Daily Report \u2014 " + dateStr);
  console.log("=".repeat(50));

  var targetKeys = ["deepseek", "kimi", "qwen", "claude", "gemini"];
  var sections = [];

  for (var i = 0; i < targetKeys.length; i++) {
    var key = targetKeys[i];
    var target = CONFIG.targets[key];
    console.log("\nSection: " + target.name);
    try {
      var results = await searchTarget(key);
      console.log("   OK: " + results.length + " results (after dedup + filter)");
      sections.push({ name: target.name, results: results });
    } catch (err) {
      console.error("   ERROR: " + err.message);
      sections.push({ name: target.name, results: [] });
    }
  }

  // Panoramic section
  console.log("\nPanoramic Overview");
  try {
    var panoramicResults = await searchTarget("panoramic");
    console.log("   OK: " + panoramicResults.length + " results");
    sections.push({
      name: "Panoramica Globale \u2014 Tutti i Modelli AI",
      results: panoramicResults,
    });
  } catch (err) {
    console.error("   ERROR: " + err.message);
    sections.push({
      name: "Panoramica Globale \u2014 Tutti i Modelli AI",
      results: [],
    });
  }

  // Build HTML with data tables
  var dataTables = [
    {
      title: "Prezzi API \u2014 Modelli di Frontiera (per 1M token)",
      rows: [
        {
          Modello: "DeepSeek V4 Pro",
          Input: "$0.435",
          Output: "$0.87",
          Note: "Taglio 75% permanente (maggio 2026)",
        },
        {
          Modello: "Gemini 3.5 Flash",
          Input: "$1.50",
          Output: "$9.00",
          Note: "GA da Google I/O 2026",
        },
        {
          Modello: "Claude Opus 4.8",
          Input: "$5.00",
          Output: "$25.00",
          Note: "Modello predefinito piani premium",
        },
        {
          Modello: "Qwen 3.7 Max",
          Input: "Variabile",
          Output: "Variabile",
          Note: "Alibaba Cloud Summit",
        },
        {
          Modello: "Kimi K2.6",
          Input: "Open-weight",
          Output: "Gratuito",
          Note: "Licenza MIT modificata",
        },
        {
          Modello: "GPT-5.5",
          Input: "$2.50",
          Output: "$10.00",
          Note: "Modello di default ChatGPT",
        },
      ],
    },
  ];

  var html = buildHtml(dateStr, sections, dataTables);

  // Save
  var outDir = path.join(__dirname, CONFIG.report.outputDir);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  var outPath = path.join(outDir, CONFIG.report.outputFile);

  // SAFETY GUARD: Don't overwrite a good report with an empty one
  var totalResults = sections.reduce(function(acc, s) { return acc + (s.results ? s.results.length : 0); }, 0);
  var prevReportExists = fs.existsSync(outPath);
  var prevReportSize = 0;
  if (prevReportExists) {
    prevReportSize = fs.statSync(outPath).size;
  }

  if (totalResults === 0) {
    console.error("\n⚠️  WARNING: 0 results obtained from all queries!");
    console.error("   Possible causes: invalid/missing API key, network error, or rate limiting.");
    if (prevReportExists && prevReportSize > 5000) {
      console.error("   Existing report found (" + (prevReportSize / 1024).toFixed(1) + " KB) — keeping it, NOT overwriting with empty report.");
      console.error("   Fix the API key issue, then re-run to regenerate.");
      return outPath; // Return path but don't write empty report
    }
    console.error("   No valid previous report — writing empty report (will show 'No updates' sections).");
  }

  fs.writeFileSync(outPath, html, "utf-8");
  console.log("\nReport saved: " + outPath);

  // Also save dated copy
  var datedName = "report-ai-" + isoDate() + ".html";
  fs.writeFileSync(path.join(outDir, datedName), html, "utf-8");
  console.log("Dated copy: " + path.join(outDir, datedName));

  return outPath;
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

if (require.main === module) {
  main()
    .then(function (outPath) {
      console.log("\nGeneration completed successfully!");
      if (process.argv.includes("--serve")) {
        require("./server.js");
      }
    })
    .catch(function (err) {
      console.error("\nFatal error:", err.message);
      process.exit(1);
    });
}

module.exports = { main: main, braveSearch: braveSearch, extractResults: extractResults, deduplicate: deduplicate };