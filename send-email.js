#!/usr/bin/env node
/**
 * NewsAI — Email Sender (with PDF attachment + full HTML inline body)
 *
 * Converts the latest HTML report to PDF via Puppeteer, then
 * sends it as an email with the FULL report content in the body
 * AND as a PDF attachment.
 *
 * If Puppeteer/PDF fails, the email is still sent with the HTML inline.
 *
 * Usage:
 *   node send-email.js                     — send report (HTML body + PDF attach)
 *   node send-email.js --to user@test.it   — override recipient
 *   node send-email.js --no-pdf            — send HTML inline only (no PDF)
 */

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

// Lazy-load puppeteer only if needed
let puppeteer = null;
function getPuppeteer() {
  if (!puppeteer) {
    try {
      puppeteer = require("puppeteer");
    } catch (e) {
      console.warn("Puppeteer not available, PDF generation will be skipped.");
      console.warn("Run: npm install puppeteer");
      return null;
    }
  }
  return puppeteer;
}

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
// Read the HTML report content
// ---------------------------------------------------------------------------

const reportHtmlContent = fs.readFileSync(reportPath, "utf-8");

// ---------------------------------------------------------------------------
// HTML -> PDF via Puppeteer (graceful fallback on failure)
// ---------------------------------------------------------------------------

async function htmlToPdf(htmlPath) {
  const puppeteerMod = getPuppeteer();
  if (!puppeteerMod) {
    console.log("Skipping PDF — Puppeteer not installed.");
    return null;
  }

  console.log("Converting HTML to PDF...");
  let browser;
  try {
    browser = await puppeteerMod.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    const page = await browser.newPage();
    const htmlContent = fs.readFileSync(htmlPath, "utf-8");
    await page.setContent(htmlContent, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      printBackground: true,
    });
    const sizeKB = (pdfBuffer.length / 1024).toFixed(1);
    console.log("PDF generated: " + sizeKB + " KB");
    if (pdfBuffer.length < 1000) {
      console.warn("WARNING: PDF is suspiciously small (" + sizeKB + " KB) — may be empty.");
      return null;
    }
    return pdfBuffer;
  } catch (err) {
    console.error("PDF generation failed: " + err.message);
    console.error("Email will be sent with HTML body only (no PDF attachment).");
    return null;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Send email with FULL report HTML in the body
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
  console.log("  From:    " + emailCfg.from);
  console.log("  To:      " + to);
  console.log("  Subject: " + subject);
  console.log("  HTML size: " + (reportHtmlContent.length / 1024).toFixed(1) + " KB");

  const transporter = nodemailer.createTransport({
    host: emailCfg.smtp.host,
    port: emailCfg.smtp.port,
    secure: emailCfg.smtp.secure || false,
    auth: {
      user: emailCfg.smtp.user,
      pass: emailCfg.smtp.pass,
    },
  });

  // Use the full report HTML as the email body
  const mailOptions = {
    from: '"NewsAI Daily" <' + emailCfg.from + ">",
    to: to,
    subject: subject,
    html: reportHtmlContent,
  };

  // Try to attach PDF (non-blocking — if it fails, email still goes out with HTML)
  if (!skipPDF) {
    try {
      const pdfBuffer = await htmlToPdf(reportPath);
      if (pdfBuffer && pdfBuffer.length > 1000) {
        mailOptions.attachments = [
          {
            filename: "report-ai-" + dateStr.replace(/\//g, "-") + ".pdf",
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ];
        console.log("PDF attached to email.");
      } else {
        console.log("No valid PDF to attach — sending HTML-only email.");
      }
    } catch (err) {
      console.error("PDF step threw exception, continuing with HTML-only: " + err.message);
    }
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
