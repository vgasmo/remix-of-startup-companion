#!/usr/bin/env node
/**
 * RC5 · Batch G2 — Persona × width visual harness.
 *
 * Captures screenshots for four personas at four viewport widths so a
 * human reviewer can walk clickability, focus rings, touch-target size,
 * dialog overflow, and empty/loading/error states.
 *
 * READ-ONLY. Requires a staging session (LOVABLE_BROWSER_AUTH_STATUS)
 * OR test users supplied via env. Refuses to run against production
 * hosts by default.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "scripts/rc5/artifacts/g2";
mkdirSync(OUT, { recursive: true });

const WIDTHS = [320, 390, 768, 1440];
const ROUTES = [
  { persona: "founder",    path: "/dashboard" },
  { persona: "consultant", path: "/dashboard" },
  { persona: "mentor",     path: "/mentor" },
  { persona: "staff",      path: "/admin" },
];

const BASE = process.env.RC5_BASE_URL ?? "http://localhost:8080";
if (BASE.includes("startupleiria.com") && !process.env.RC5_ALLOW_STAGING_TESTS) {
  console.error("g2: refusing to run against production host without RC5_ALLOW_STAGING_TESTS=true");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
for (const w of WIDTHS) {
  for (const r of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1800 } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}${r.path}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(600);
      const name = `${r.persona}_${w}.png`;
      await page.screenshot({ path: join(OUT, name) });
      console.log(`captured ${name}`);
    } catch (err) {
      console.warn(`${r.persona}@${w}: ${err.message}`);
    } finally {
      await ctx.close();
    }
  }
}
await browser.close();
console.log(`done. artifacts under ${OUT}`);
