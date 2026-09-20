import { chromium } from "playwright-core";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = join(root, "test", "fixtures", "lobster");
const check = process.argv.includes("--check");
const target = check ? join(output, ".actual") : output;
const baseline = check ? JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) : null;
const { LOBSTER_FLAVORS } = await import(pathToFileURL(join(root, "dist", "creatures.js")).href);
const { creatureSvg } = await import(pathToFileURL(join(root, "dist", "creatures.js")).href);
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  await mkdir(target, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 480, height: 420 }, deviceScaleFactor: 1 });
  const manifest = { source: "OpenClaw ui/src/components/lobster-pet-look.ts + lobster-pet-sprites*.ts", viewport: [480, 420], fixtures: {} };
  for (const flavor of LOBSTER_FLAVORS) {
    await page.setContent(`<!doctype html><style>html,body{margin:0;width:480px;height:420px;background:#101820}svg{width:480px;height:420px}*,*::before,*::after{animation:none!important;transition:none!important}</style>${creatureSvg("lobster", { flavor })}`);
    const file = join(target, `${flavor}.png`);
    await page.screenshot({ path: file });
    const bytes = await readFile(file);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (check && baseline.fixtures[flavor]?.sha256 !== sha256) {
      throw new Error(`${flavor}: rendered pixels differ from the checked-in fixture`);
    }
    manifest.fixtures[flavor] = { file: `${flavor}.png`, sha256 };
  }
  if (!check) await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
} finally {
  await browser.close();
  if (check) await rm(target, { recursive: true, force: true });
}
