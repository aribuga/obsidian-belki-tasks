import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("hidden utility styles are scoped to belki surfaces", () => {
  const css = readFileSync("src/styles/11-mobile.css", "utf8");

  assert.doesNotMatch(
    css,
    /(^|[}\n\r])\s*\.is-hidden\s*\{/,
    "Belki must not define a global .is-hidden rule that can affect Obsidian workspace UI."
  );
  assert.match(css, /\.belki-root \.is-hidden/);
  assert.match(css, /\.modal\.belki-modal-detail \.is-hidden/);
});
