#!/usr/bin/env node
"use strict";

const { cpSync, mkdirSync, existsSync } = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "test-vaults", "belki-test", ".obsidian", "plugins", "belki");
const files = ["main.js", "manifest.json", "styles.css"];

mkdirSync(dest, { recursive: true });

let copied = 0;
for (const file of files) {
  const src = path.join(root, file);
  if (existsSync(src)) {
    cpSync(src, path.join(dest, file));
    console.log(`  ✓ ${file}`);
    copied++;
  } else {
    console.log(`  – ${file} (skipped, not found)`);
  }
}

console.log(`\nCopied ${copied}/${files.length} files → test-vaults/belki-test/.obsidian/plugins/belki/`);
console.log("Open test-vaults/belki-test in Obsidian to start testing.");
