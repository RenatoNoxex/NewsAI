#!/usr/bin/env node
/**
 * NewsAI — Email Sender (with PDF attachment)
 *
 * Converts the latest HTML report to PDF via Puppeteer, then
 * sends it as an email attachment via nodemailer.
 *
 * Usage:
 *   node send-email.js                     — send latest report as PDF
 *   node send-email.js --to user@test.it   — override recipient
 *   node send-email.js --no-pdf            — send HTML inline (no attachment)
 */

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const puppeteer = require("puppeteer");

const CONFIG_PATH = path.join(__dirname, "config.json");
let emailCfg;

// GitHub Actions / cloud mode: read SMTP from environment variables
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  emailCfg = {
    enabled: true,
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: process.env.EMAIL_TO || process.env.SMTP_USER,
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || "",
    },
  };
  console.log("Using environment variables for SMTP (cloud mode)");
} else {
  // Local mode: read from config.json
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("config.json not found. Set SMTP_HOST env var or create config.json");
    process.exit(1);
  }
  const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  emailCfg = CONFIG.email;

  if (!emailCfg || !emailCfg.enabled) {
    console.log("Email sending is disabled in config.json. Set email.enabled to true.");
    console.log("Edit config.json and configure SMTP settings, then run again.");
    process.exit(0);
  }
}

// Report path: use config.json in local mode, hardcoded in cloud mode
let reportPath;
if (process.env.SMTP_HOST) {
  reportPath = path.join(__dirname, "reports", "report-ai.html");
} else {
  const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  reportPath = path.join(__dirname, CONFIG.report.outputDir, CONFIG.report.outputFile);
}

if (!fs.existsSync(reportPath)) {
  console.error("Report not found: " + reportPath);
  console.error("Run 'node generate-report.js' first.");
  process.exit(1);
}

// CLI args
const args = process.argv.slice(2);
const skipPDF = args.includes("--no-pdf");

// Recipient override
let to = emailCfg.to;
const toIdx = args.indexOf("--to");
if (toIdx !== -1 && args.length > toIdx + 1) {
  to = args[toIdx + 1];
}

// ---------------------------------------------------------------------------
// HTML -> PDF via Puppeteer
// ---------------------------------------------------------------------------

async function htmlToPdf(htmlPath) {
  console.log("Converting HTML to PDF...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const htmlContent = fs.readFileSync(htmlPath, "utf-8");
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      printBackground: true,
    });
    console.log("PDF generated: " + (pdfBuffer.length / 1024).toFixed(1) + " KB");
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Send email
// ---------------------------------------------------------------------------

async function send() {
  const today = new Date();
  const dateStr =
    String(today.getDate()).padStart(2, "0") +
    "/" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "/" +
    today.getFullYear();
  const subject = "📅 Report Aggiornamenti AI — " + dateStr;

  console.log("Sending email...");
  console.log("  From: " + emailCfg.from);
  console.log("  To:   " + to);
  console.log("  Subject: " + subject);

  const transporter = nodemailer.createTransport({
    host: emailCfg.smtp.host,
    port: emailCfg.smtp.port,
    secure: emailCfg.smtp.secure || false,
    auth: {
      user: emailCfg.smtp.user,
      pass: emailCfg.smtp.pass,
    },
  });

  const mailOptions = {
    from: '"NewsAI Daily" <' + emailCfg.from + ">",
    to: to,
    subject: subject,
    html:
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">' +
      '<h2 style="color:#0047AB;">📅 Report Aggiornamenti AI — ' +
      dateStr +
      "</h2>" +
      "<p>Il report quotidiano sui modelli AI è allegato in formato PDF.</p>" +
      "<p>Modelli monitorati: DeepSeek, Kimi, Qwen, Claude, Gemini + panoramica globale.</p>" +
      '<p style="color:#888;font-size:0.85em;">NewsAI Daily — generazione automatica alle 7:00 CET</p>' +
      "</div>",
  };

  if (!skipPDF) {
    const pdfBuffer = await htmlToPdf(reportPath);
    mailOptions.attachments = [
      {
        filename: "report-ai-" + dateStr.replace(/\//g, "-") + ".pdf",
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully!");
    console.log("Message ID: " + info.messageId);
  } catch (err) {
    console.error("Failed to send email:");
    console.error(err.message);
    process.exit(1);
  }
}

send();