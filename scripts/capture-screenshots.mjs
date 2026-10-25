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
const THEME = process.argv[3] ?? "light";
const OUT = "docs/screenshots";
const VIEWPORT = { width: 1600, height: 1000 };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: THEME, reducedMotion: "reduce" });
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
  // Full-page captures draw sticky chrome where the page is scrolled, so start from the top.
  if (opts.fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  console.log(`saved ${OUT}/${name}.png`);
}

async function run() {
  const button = page.getByRole("button", { name: /^Run/ }).first();
  await button.waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Run") && !b.disabled), null, { timeout: 60_000 });
  await button.click();
}

const flow = 'section[aria-labelledby="flow-title"]';

// Brings the routing decision up under the top bar, so the shot shows the decision rather than the scenario picker.
async function focusFlow() {
  await page.locator(flow).evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 88));
  await page.waitForTimeout(400);
}

// 01 Overview
await open("/", "#traffic-title");
await shot("01-overview");

// 02 Routing decision (hero): confidential brief, cloud blocked, local selected
await open("/route?scenario=confidential-client-brief", "text=Why this route?");
await focusFlow();
await shot("02-routing-decision");
await page.locator(flow).screenshot({ path: `${OUT}/02-routing-decision-panel.png` });
console.log(`saved ${OUT}/02-routing-decision-panel.png`);

// 04–06 other routing outcomes
await open("/route?scenario=restricted-local-offline", "text=Request blocked");
await focusFlow();
await shot("04-fail-closed");
await open("/route?scenario=budget-exhausted", "text=Rerouted by Budget Guard");
await focusFlow();
await shot("05-budget-guard");
await open("/route?scenario=strategic-positioning", "text=Why this route?");
await focusFlow();
await shot("06-sonnet-over-opus");

// 07 Real local execution and its trace
await open("/route?scenario=confidential-client-brief", "text=Why this route?");
await run();
const result = page.locator('section[aria-labelledby="result-title"]').first();
await result.waitFor({ timeout: 600_000 });
await result.getByRole("button", { name: /Decision trace/ }).click();
// The result is taller than the viewport; a sticky top bar would be drawn across it.
await page.addStyleTag({ content: "header { position: static !important; }" });
await page.waitForTimeout(1500);
await result.screenshot({ path: `${OUT}/07-request-trace.png` });
console.log(`saved ${OUT}/07-request-trace.png`);

// 03 Comparison Lab with real local runs
await open("/compare?scenario=public-summary", "text=Value map");
await run();
await page.waitForTimeout(800);
await page.waitForFunction(
  () => {
    const text = document.body.innerText.toLowerCase();
    const idle = [...document.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Run") && !b.disabled);
    return idle && text.includes("recommended from measured runs") && !text.includes("queued");
  },
  null,
  { timeout: 900_000, polling: 1000 },
);
await page.waitForTimeout(1500);
await shot("03-comparison-lab", { fullPage: true });

// 08 Governance
await open("/governance", "text=Effective access");
await shot("08-governance");

await browser.close();
