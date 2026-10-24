/**
 * Captures the README / portfolio screenshots from a running app.
 *
 *   npm run dev            # in another terminal (Ollama running for real local runs)
 *   node scripts/capture-screenshots.mjs [baseUrl] [theme]
 *
 * Runs real flows: the Comparison Lab executes local models for real and the
 * trace screenshot comes from a real local execution. Cloud stays in DEMO mode
 * unless the server was started with live mode, so this costs nothing by default.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const THEME = process.argv[3] ?? "dark";
const OUT = "docs/screenshots";
const VIEWPORT = { width: 1600, height: 1000 };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: THEME });
await ctx.addInitScript((t) => {
  try {
    localStorage.setItem("theme", t);
  } catch {}
}, THEME);
const page = await ctx.newPage();

async function open(path, waitFor) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120_000 });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 60_000 });
  await page.waitForTimeout(1200);
}

async function shot(name, opts = {}) {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  console.log(`saved ${OUT}/${name}.png`);
}

// 01 Overview
await open("/", "text=Requests by execution location");
await shot("01-overview");

// 02 Routing decision (hero): confidential brief, cloud blocked, local selected
await open("/route?scenario=confidential-client-brief", "text=Routing score");
await shot("02-routing-decision");
const decisionPanel = page.locator("h2:has-text('Routing decision')").locator("xpath=ancestor::section[1]");
await decisionPanel.screenshot({ path: `${OUT}/02-routing-decision-panel.png` });
console.log(`saved ${OUT}/02-routing-decision-panel.png`);

// 04–06 other routing outcomes
await open("/route?scenario=restricted-local-offline", "text=fail-closed");
await shot("04-fail-closed");
await open("/route?scenario=budget-exhausted", "text=Rerouted by Budget Guard");
await shot("05-budget-guard");
await open("/route?scenario=strategic-positioning", "text=Routing score");
await shot("06-sonnet-over-opus");

// 07 Real local execution and its trace
await open("/route?scenario=confidential-client-brief", "text=Routing score");
await page.locator("button:has-text('Run locally')").first().click();
await page.waitForSelector("h2:has-text('Execution')", { timeout: 600_000 });
await page.waitForTimeout(1500);
const exec = page.locator("h2:has-text('Execution')").locator("xpath=ancestor::section[1]");
await exec.screenshot({ path: `${OUT}/07-request-trace.png` });
console.log(`saved ${OUT}/07-request-trace.png`);

// 03 Comparison Lab with real local runs
await open("/compare?scenario=public-summary", "text=Routing score");
await page.locator("button:has-text('Run ')").first().click();
await page.waitForFunction(
  () => document.body.innerText.includes("Ranked on measured results") && !/\brunning\b|\bqueued\b/.test(document.body.innerText),
  null,
  { timeout: 900_000, polling: 1000 },
);
await page.waitForTimeout(1500);
await shot("03-comparison-lab", { fullPage: true });

// 08 Governance
await open("/governance", "text=Effective access");
await shot("08-governance");

await browser.close();
