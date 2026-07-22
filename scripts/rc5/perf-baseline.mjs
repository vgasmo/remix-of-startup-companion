#!/usr/bin/env node
/**
 * RC5 · Batch G3 — Measured performance harness.
 *
 * Captures per-route metrics: navigation timing, Web Vitals, request
 * count, duplicate request count, long tasks > 50 ms. Emits a JSON
 * baseline that docs/rc5/performance-baseline.md references.
 *
 * READ-ONLY. Refuses to run against production hosts by default.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "scripts/rc5/artifacts/g3";
mkdirSync(OUT, { recursive: true });

const BASE = process.env.RC5_BASE_URL ?? "http://localhost:8080";
if (BASE.includes("startupleiria.com") && !process.env.RC5_ALLOW_STAGING_TESTS) {
  console.error("g3: refusing to run against production host without RC5_ALLOW_STAGING_TESTS=true");
  process.exit(2);
}

const ROUTES = [
  { persona: "staff",      path: "/admin" },
  { persona: "founder",    path: "/dashboard" },
  { persona: "consultant", path: "/dashboard" },
  { persona: "mentor",     path: "/mentor" },
];

const results = [];
const browser = await chromium.launch({ headless: true });
for (const r of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 1800 } });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (req) => requests.push(req.url()));

  const t0 = Date.now();
  try {
    await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle", timeout: 20000 });
    const vitals = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const long = performance.getEntriesByType("longtask") ?? [];
      return {
        ttfb: nav?.responseStart ?? null,
        dcl: nav?.domContentLoadedEventEnd ?? null,
        load: nav?.loadEventEnd ?? null,
        long_tasks_over_50ms: long.filter((t) => t.duration > 50).length,
      };
    });
    const dupes = requests.length - new Set(requests).size;
    results.push({
      persona: r.persona,
      path: r.path,
      wall_ms: Date.now() - t0,
      request_count: requests.length,
      duplicate_requests: dupes,
      ...vitals,
    });
  } catch (err) {
    results.push({ persona: r.persona, path: r.path, error: err.message });
  } finally {
    await ctx.close();
  }
}
await browser.close();

const stamp = new Date().toISOString().replaceAll(":", "-");
const file = join(OUT, `baseline_${stamp}.json`);
writeFileSync(file, JSON.stringify(results, null, 2));
console.log(`wrote ${file}`);
console.table(results);
