#!/usr/bin/env node
/**
 * NewsAI — Simple HTTP Server
 * Serves the generated HTML report on the configured port.
 * Usage: node server.js
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");

if (!fs.existsSync(CONFIG_PATH)) {
  console.error("config.json not found. Run generate-report.js first.");
  process.exit(1);
}

const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
const port = (CONFIG.webServer && CONFIG.webServer.port) || 3000;
const reportDir = path.join(__dirname, CONFIG.report.outputDir);
const reportFile = CONFIG.report.outputFile;

const app = express();

// Serve static files from the reports directory
app.use("/reports", express.static(reportDir));

// Serve the latest report at the root
app.get("/", function (req, res) {
  const reportPath = path.join(reportDir, reportFile);
  if (!fs.existsSync(reportPath)) {
    res.status(404).send(
      "<html><body style='font-family:Arial;padding:40px;'>" +
        "<h1>Report non ancora generato</h1>" +
        "<p>Esegui <code>node generate-report.js</code> per generare il report.</p>" +
        "</body></html>"
    );
    return;
  }
  res.sendFile(reportPath);
});

// JSON API endpoint for programmatic access
app.get("/api/latest", function (req, res) {
  const reportPath = path.join(reportDir, reportFile);
  if (!fs.existsSync(reportPath)) {
    res.json({ error: "Report not yet generated", timestamp: null });
    return;
  }
  const html = fs.readFileSync(reportPath, "utf-8");
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    reportUrl: "/",
    htmlSize: html.length,
  });
});

app.listen(port, function () {
  console.log("NewsAI Report Server running at http://localhost:" + port);
  console.log("Press Ctrl+C to stop");
});

module.exports = app;