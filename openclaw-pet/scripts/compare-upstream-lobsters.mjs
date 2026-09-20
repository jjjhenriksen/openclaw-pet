import { build } from "esbuild";
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const upstreamUi = "/Users/jacquelinehenriksen/openclaw/ui";
const upstreamRevision = "v2026.8.1";
const fixtureDir = join(root, "test", "fixtures", "lobster");
const outputDir = join(root, "output", "upstream-comparison");
const maxChangedPct = 5;
const manifest = JSON.parse(await readFile(join(fixtureDir, "manifest.json"), "utf8"));
const flavors = Object.keys(manifest.fixtures);

const entry = `
  import { render } from "lit";
  import { canonicalLobsterLook, lobsterLookStyle, renderLobsterSvg } from "${upstreamUi}/src/components/lobster-pet-look.ts";
  import { LOBSTER_PET_PALETTES } from "${upstreamUi}/src/components/lobster-pet-palettes.ts";
  globalThis.mountUpstreamLobster = (root, id) => {
    const palette = LOBSTER_PET_PALETTES.find((candidate) => candidate.id === id);
    if (!palette) throw new Error("Unknown upstream palette: " + id);
    const look = canonicalLobsterLook(palette);
    // Keep palette selectors, but omit the production placement class: this
    // fixture deliberately enlarges the SVG to the full comparison viewport.
    root.className = "lobster-pet--palette-" + id;
    root.setAttribute("style", lobsterLookStyle(look));
    render(renderLobsterSvg(look, { standalone: true }), root);
  };
`;

const bundled = await build({
  absWorkingDir: upstreamUi,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  stdin: { contents: entry, loader: "ts", resolveDir: upstreamUi },
  loader: { ".css": "empty" },
  write: false,
});
const upstreamScript = bundled.outputFiles[0].text;
const upstreamCss = execFileSync("git", [
  "-C", "/Users/jacquelinehenriksen/openclaw",
  "show", `${upstreamRevision}:ui/src/styles/lobster-pet.css`,
], { encoding: "utf8" });

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 480, height: 420 }, deviceScaleFactor: 1 });
const results = {};
try {
  for (const flavor of flavors) {
    const adapterFile = join(fixtureDir, `${flavor}.png`);
    const upstreamFile = join(outputDir, `${flavor}.upstream.png`);
    await page.setContent(`<!doctype html><style>${upstreamCss}</style><style>html,body{margin:0;width:480px;height:420px;background:#101820}#root{width:480px;height:420px}svg{width:480px;height:420px}*,*::before,*::after{animation:none!important;transition:none!important}</style><div id="root"></div><script>${upstreamScript}</script>`);
    await page.evaluate((id) => globalThis.mountUpstreamLobster(document.querySelector("#root"), id), flavor);
    await page.screenshot({ path: upstreamFile });

    const expected = PNG.sync.read(await readFile(adapterFile));
    const actual = PNG.sync.read(await readFile(upstreamFile));
    if (expected.width !== actual.width || expected.height !== actual.height) {
      throw new Error(`${flavor}: screenshot dimensions differ`);
    }
    let changed = 0;
    let totalDelta = 0;
    for (let i = 0; i < expected.data.length; i += 4) {
      const delta = Math.abs(expected.data[i] - actual.data[i]) + Math.abs(expected.data[i + 1] - actual.data[i + 1]) + Math.abs(expected.data[i + 2] - actual.data[i + 2]) + Math.abs(expected.data[i + 3] - actual.data[i + 3]);
      if (delta !== 0) changed += 1;
      totalDelta += delta;
    }
    const pixels = expected.width * expected.height;
    results[flavor] = {
      changedPixels: changed,
      changedPct: Number((changed / pixels * 100).toFixed(3)),
      meanChannelDelta: Number((totalDelta / pixels / 4).toFixed(3)),
      adapterSha256: createHash("sha256").update(await readFile(adapterFile)).digest("hex"),
      upstreamSha256: createHash("sha256").update(await readFile(upstreamFile)).digest("hex"),
    };
    if (results[flavor].changedPct > maxChangedPct) {
      throw new Error(`${flavor}: ${results[flavor].changedPct}% of pixels differ from upstream (limit ${maxChangedPct}%)`);
    }
  }
} finally {
  await browser.close();
}

await writeFile(join(outputDir, "report.json"), JSON.stringify({
  source: `${upstreamUi}/src/components/lobster-pet-look.ts`,
  revision: upstreamRevision,
  css: `${upstreamRevision}:ui/src/styles/lobster-pet.css`,
  viewport: [480, 420],
  fixtures: results,
}, null, 2) + "\n");

const rows = Object.entries(results).sort(([, a], [, b]) => b.changedPct - a.changedPct);
console.log(`Compared ${rows.length} variants against upstream source.`);
for (const [flavor, result] of rows) {
  console.log(`${flavor.padEnd(12)} ${String(result.changedPct).padStart(7)}% changed  mean delta ${result.meanChannelDelta}`);
}
