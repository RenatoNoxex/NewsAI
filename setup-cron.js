#!/usr/bin/env node
/**
 * NewsAI — Cron Job Manager
 *
 * Sets up or removes a macOS launchd job that runs the report generator
 * every day at 7:00 AM.
 *
 * Usage:
 *   node setup-cron.js          — install the daily 7AM cron job
 *   node setup-cron.js --remove — remove the cron job
 *   node setup-cron.js --status — show current status
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PLIST_NAME = "com.newsai.daily-report.plist";
const LAUNCH_AGENTS_DIR = path.join(
  process.env.HOME,
  "Library",
  "LaunchAgents"
);
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, PLIST_NAME);

function getProjectDir() {
  return __dirname;
}

function generatePlist() {
  const projectDir = getProjectDir();
  const nodePath = process.execPath || "/usr/local/bin/node";
  const scriptPath = path.join(projectDir, "daily-job.js");
  const logDir = path.join(projectDir, "logs");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"',
    '  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "    <key>Label</key>",
    "    <string>" + PLIST_NAME.replace(".plist", "") + "</string>",
    "    <key>ProgramArguments</key>",
    "    <array>",
    "        <string>" + nodePath + "</string>",
    "        <string>" + scriptPath + "</string>",
    "    </array>",
    "    <key>StartCalendarInterval</key>",
    "    <dict>",
    "        <key>Hour</key>",
    "        <integer>7</integer>",
    "        <key>Minute</key>",
    "        <integer>0</integer>",
    "    </dict>",
    "    <key>StandardOutPath</key>",
    "    <string>" + path.join(logDir, "stdout.log") + "</string>",
    "    <key>StandardErrorPath</key>",
    "    <string>" + path.join(logDir, "stderr.log") + "</string>",
    "    <key>EnvironmentVariables</key>",
    "    <dict>",
    "        <key>PATH</key>",
    "        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>",
    "        <key>HOME</key>",
    "        <string>" + process.env.HOME + "</string>",
    "    </dict>",
    "    <key>RunAtLoad</key>",
    "    <false/>",
    "</dict>",
    "</plist>",
  ].join("\n");
}

function install() {
  // Ensure LaunchAgents directory exists
  if (!fs.existsSync(LAUNCH_AGENTS_DIR)) {
    fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  }

  // Create logs directory
  const logDir = path.join(getProjectDir(), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Write plist
  const plistContent = generatePlist();
  fs.writeFileSync(PLIST_PATH, plistContent, "utf-8");
  console.log("Plist created: " + PLIST_PATH);

  // Load the job
  try {
    execSync("launchctl load " + PLIST_PATH, { stdio: "inherit" });
    console.log("Successfully loaded: " + PLIST_NAME);
    console.log("The report will be generated + emailed every day at 7:00 AM.");
    console.log("Logs will be written to: " + logDir);
  } catch (err) {
    console.error("Failed to load launchd job:");
    console.error(err.message);
    console.error("Try running: launchctl load " + PLIST_PATH);
  }
}

function uninstall() {
  if (!fs.existsSync(PLIST_PATH)) {
    console.log("No cron job found at: " + PLIST_PATH);
    return;
  }

  try {
    execSync("launchctl unload " + PLIST_PATH, { stdio: "inherit" });
    console.log("Unloaded: " + PLIST_NAME);
  } catch (err) {
    // May already be unloaded
    console.log("Job already unloaded or not running.");
  }

  fs.unlinkSync(PLIST_PATH);
  console.log("Removed: " + PLIST_PATH);
  console.log("Cron job removed successfully.");
}

function status() {
  if (!fs.existsSync(PLIST_PATH)) {
    console.log("Status: NOT INSTALLED");
    console.log("Run 'node setup-cron.js' to install the 7:00 AM daily job.");
    return;
  }
  console.log("Status: INSTALLED");
  console.log("Plist: " + PLIST_PATH);
  console.log("");
  console.log("Next run: Every day at 7:00 AM");
  console.log("");
  console.log("Management commands:");
  console.log("  node setup-cron.js           — reinstall / update");
  console.log("  node setup-cron.js --remove  — uninstall");
  console.log("");
  console.log("Manual test run:");
  console.log("  node daily-job.js --dry      (generate only)");
  console.log("  node daily-job.js            (generate + email)");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--remove") || args.includes("--uninstall")) {
  uninstall();
} else if (args.includes("--status")) {
  status();
} else {
  install();
}