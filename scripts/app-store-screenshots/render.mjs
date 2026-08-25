#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "../..");
const root = join(projectRoot, "app-store-screenshots");
const backgrounds = join(root, "_backgrounds");
const translations = JSON.parse(await readFile(join(scriptDir, "translations.json"), "utf8"));

const artboards = {
  iphone: [
    {
      index: 1,
      width: 1284,
      height: 2778,
      texts: [{ key: "oneTap", x: 171, y: 425, width: 942, fontSize: 110.145, weight: 700, color: "#ffffff", lines: 2 }],
    },
    { index: 2, width: 1284, height: 2778, texts: [] },
    {
      index: 3,
      width: 1284,
      height: 2778,
      texts: [
        { key: "organize", x: 241, y: 443, width: 832, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "folders", x: 235, y: 580.682, width: 844, fontSize: 94.410, weight: 500, color: "#929297" },
      ],
    },
    {
      index: 4,
      width: 1284,
      height: 2778,
      texts: [
        { key: "oneHandle", x: 135, y: 447, width: 1014, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "publish", x: 97, y: 584.682, width: 1090, fontSize: 94.410, weight: 500, color: "#929297" },
      ],
    },
    {
      index: 5,
      width: 1284,
      height: 2778,
      texts: [
        { key: "workflow", x: 278, y: 443, width: 759, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "alreadyThere", x: 400, y: 580.682, width: 515, fontSize: 94.410, weight: 500, color: "#929297" },
        { key: "browser", x: 287.728, y: 1736.785, width: 710, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "chrome", x: 419.228, y: 1864.520, width: 447, fontSize: 70.808, weight: 500, color: "#adadad" },
        { key: "launcher", x: 258.380, y: 1168, width: 768, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "raycast", x: 528.380, y: 1292.785, width: 228, fontSize: 70.808, weight: 500, color: "#adadad" },
        { key: "phone", x: 329.732, y: 2308.520, width: 626, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "nativeShare", x: 464.232, y: 2450.023, width: 357, fontSize: 70.808, weight: 500, color: "#adadad" },
      ],
    },
  ],
  ipad: [
    {
      index: 1,
      width: 2048,
      height: 2732,
      texts: [{ key: "oneTap", x: 553, y: 458, width: 942, fontSize: 110.145, weight: 700, color: "#ffffff", lines: 2 }],
    },
    {
      index: 2,
      width: 2048,
      height: 2732,
      texts: [
        { key: "organize", x: 608, y: 458, width: 832, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "folders", x: 602, y: 595.682, width: 844, fontSize: 94.410, weight: 500, color: "#929297" },
      ],
    },
    {
      index: 3,
      width: 2048,
      height: 2732,
      texts: [
        { key: "saveNow", x: 753, y: 432, width: 542, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "readReady", x: 546, y: 569.682, width: 957, fontSize: 94.410, weight: 500, color: "#929297" },
      ],
    },
    {
      index: 4,
      width: 2048,
      height: 2732,
      texts: [
        { key: "oneHandle", x: 517, y: 392.734, width: 1014, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "publish", x: 479, y: 530.416, width: 1090, fontSize: 94.410, weight: 500, color: "#929297" },
      ],
    },
    {
      index: 5,
      width: 2048,
      height: 2732,
      texts: [
        { key: "workflow", x: 644.5, y: 312.734, width: 759, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "alreadyThere", x: 766.5, y: 450.416, width: 515, fontSize: 94.410, weight: 500, color: "#929297" },
        { key: "browser", x: 681.784, y: 1667.917, width: 710, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "chrome", x: 813.284, y: 1795.652, width: 447, fontSize: 70.808, weight: 500, color: "#adadad" },
        { key: "launcher", x: 652.784, y: 1072.935, width: 768, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "raycast", x: 922.784, y: 1197.719, width: 228, fontSize: 70.808, weight: 500, color: "#adadad" },
        { key: "phone", x: 724.276, y: 2268.799, width: 626, fontSize: 110.145, weight: 700, color: "#ffffff" },
        { key: "nativeShare", x: 858.776, y: 2410.302, width: 357, fontSize: 70.808, weight: 500, color: "#adadad" },
      ],
    },
  ],
};

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderText(spec, locale) {
  const value = translations[locale]?.[spec.key];
  if (value == null) throw new Error(`Missing ${locale}.${spec.key}`);
  const lines = value.split("\n");
  const lineHeight = spec.fontSize * 1.02;
  const baseline = spec.y + spec.fontSize * 0.84;
  // ImageMagick's SVG renderer interprets negative letter spacing inconsistently
  // across the installed font backends, so keep the system font's native spacing.
  const letterSpacing = 0;
  const spans = lines.map((line, index) =>
    `<tspan x="${spec.x + spec.width / 2}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
  ).join("");
  return `<text x="${spec.x + spec.width / 2}" y="${baseline}" text-anchor="middle" fill="${spec.color}" font-family=".SF NS" font-size="${spec.fontSize}" font-weight="${spec.weight}" letter-spacing="${letterSpacing}">${spans}</text>`;
}

function overlaySvg(artboard, locale) {
  const text = artboard.texts.map((spec) => renderText(spec, locale)).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${artboard.width}" height="${artboard.height}" viewBox="0 0 ${artboard.width} ${artboard.height}">${text}</svg>`;
}

async function ensureMagick() {
  try {
    await execFileAsync("magick", ["-version"]);
  } catch {
    throw new Error("ImageMagick (`magick`) is required to render localized screenshots.");
  }
}

const requestedLocales = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const locales = requestedLocales.length > 0 ? requestedLocales : ["en", "nl"];
await ensureMagick();
const temp = await mkdtemp(join(tmpdir(), "sleevy-app-store-")).catch(() => null);
if (!temp) throw new Error("Could not create a temporary render directory.");

try {
  for (const locale of locales) {
    if (!translations[locale]) throw new Error(`No translations configured for locale: ${locale}`);
    for (const [device, deviceArtboards] of Object.entries(artboards)) {
      const outputDir = join(root, device, locale);
      await mkdir(outputDir, { recursive: true });
      for (const artboard of deviceArtboards) {
        const input = join(backgrounds, device, `${String(artboard.index).padStart(2, "0")}.png`);
        const output = join(outputDir, `${String(artboard.index).padStart(2, "0")}.png`);
        if (artboard.texts.length === 0) {
          await copyFile(input, output);
          continue;
        }
        const overlay = join(temp, `${device}-${locale}-${artboard.index}.svg`);
        await writeFile(overlay, overlaySvg(artboard, locale), "utf8");
        await execFileAsync("magick", [input, "-background", "none", overlay, "-compose", "over", "-composite", output]);
      }
    }
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log(`Rendered ${locales.length} locale(s) × 2 devices × 5 screenshots.`);
