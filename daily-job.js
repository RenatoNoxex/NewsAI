#!/usr/bin/env node
/**
 * NewsAI — Daily Job Runner
 *
 * Runs the full pipeline:
 *   1. Generate the HTML report (searches via Brave Search API)
 *   2. Send the report as PDF via email
 *
 * This is the script that gets executed every day at 7:00 AM by launchd.
 * Logs are written to ./logs/daily-job.log
 *
 * Usage:
 *   node daily-job.js          — generate + send email
 *   node daily-job.js --dry    — generate only, skip email
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PROJECT_DIR = __dirname;
const LOG_DIR = path.join(PROJECT_DIR, "logs");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = "[" + ts + "] " + msg;
  console.log(line);
  fs.appendFileSync(path.join(LOG_DIR, "daily-job.log"), line + "\n", "utf-8");
}

function runScript(scriptPath, label) {
  return new Promise((resolve, reject) => {
    log("Starting: " + label + " (" + scriptPath + ")");
    try {
      const stdout = execSync("node \"" + scriptPath + "\"", {
        cwd: PROJECT_DIR,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 120000, // 2 minutes
      });
      log(label + " — OK");
      log(stdout.trim().slice(-500)); // last 500 chars
      resolve(stdout);
    } catch (err) {
      log(label + " — FAILED: " + err.message);
      if (err.stdout) log("stdout: " + err.stdout.slice(-500));
      if (err.stderr) log("stderr: " + err.stderr.slice(-500));
      reject(err);
    }
  });
}

async function main() {
  log("========================================");
  log("DAILY JOB STARTED");
  log("========================================");

  const dryRun = process.argv.includes("--dry");

  // Step 1: Generate the report
  try {
    await runScript(
      path.join(PROJECT_DIR, "generate-report.js"),
      "Step 1/2 — Generate Report"
    );
  } catch (err) {
    log("Generate step failed, aborting.");
    process.exit(1);
  }

  // Step 2: Send email (unless --dry)
  if (!dryRun) {
    try {
      await runScript(
        path.join(PROJECT_DIR, "send-email.js"),
        "Step 2/2 — Send Email"
      );
    } catch (err) {
      log("Email send failed! Logging the error but the report was generated.");
      log("Manual retry: node send-email.js");
      process.exit(1);
    }
  } else {
    log("Dry run — skipping email send.");
  }

  log("========================================");
  log("DAILY JOB COMPLETED SUCCESSFULLY");
  log("========================================");
}

main().catch((err) => {
  log("FATAL: " + err.message);
  process.exit(1);
});