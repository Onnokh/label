#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, copyFile } from "node:fs/promises";
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

const fontFamily = ".SF NS";
const fontFamilies = {
  ja: "Hiragino Sans",
  ko: "Apple SD Gothic Neo",
  "zh-Hans": "Hiragino Sans GB",
  "zh-Hant": "Hiragino Sans GB",
  "ar-SA": "Geeza Pro",
  he: "SF Hebrew",
  "bn-BD": "Kohinoor Bangla",
  "gu-IN": "Gujarati Sangam MN",
  hi: "Kohinoor Devanagari",
  "kn-IN": "SF Kannada",
  "ml-IN": "Malayalam MN",
  "mr-IN": "Kohinoor Devanagari",
  "or-IN": "Noto Sans Oriya",
  "pa-IN": "Gurmukhi MN",
  "ta-IN": "SF Tamil",
  "te-IN": "Telugu Sangam MN",
  th: "Thonburi",
  "ur-PK": "Geeza Pro",
};
const trackingRatio = -0.04;
const textSafeArea = 0.88;

function fontFamilyForLocale(locale) {
  return fontFamilies[locale] ?? fontFamily;
}

async function measureTextWidth(value, fontSize, weight, kerning, family) {
  if (!value) return 0;
  const { stdout } = await execFileAsync("magick", [
    "-background",
    "none",
    "-family",
    family,
    "-weight",
    String(weight),
    "-pointsize",
    String(fontSize),
    "-kerning",
    String(kerning),
    "-format",
    "%w",
    `label:${value}`,
    "info:",
  ]);
  const width = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(width)) throw new Error(`Could not measure localized text: ${value}`);
  return width;
}

async function renderOverlay(artboard, locale, output) {
  const args = ["-size", `${artboard.width}x${artboard.height}`, "xc:none"];
  const specs = [];
  const family = fontFamilyForLocale(locale);
  const localeTranslations = translations[locale] ?? translations.en;

  for (const spec of artboard.texts) {
    const value = localeTranslations?.[spec.key];
    if (value == null) throw new Error(`Missing ${locale}.${spec.key}`);
    const lines = value.split("\n");
    const kerning = spec.fontSize * trackingRatio;
    const measuredWidths = await Promise.all(lines.map((line) => measureTextWidth(line, spec.fontSize, spec.weight, kerning, family)));
    const widestTrackedLine = Math.max(...measuredWidths, 0);
    const usableWidth = spec.width * textSafeArea;
    const scale = widestTrackedLine > usableWidth ? usableWidth / widestTrackedLine : 1;
    const fontSize = spec.fontSize * scale;
    const lineHeight = fontSize * 1.02;
    const centerX = spec.x + spec.width / 2;
    specs.push({ spec, lines, fontSize, lineHeight, centerX });
  }

  for (const { spec, lines, fontSize, lineHeight, centerX } of specs) {
    const kerning = fontSize * trackingRatio;
    for (const [index, line] of lines.entries()) {
      const top = spec.y - fontSize * 0.1 + index * lineHeight;
      const horizontalOffset = centerX - artboard.width / 2;
      args.push(
        "-family", family,
        "-weight", String(spec.weight),
        "-pointsize", String(fontSize),
        "-fill", spec.color,
        "-kerning", String(kerning),
        "-gravity", "North",
        "-annotate", `+${horizontalOffset}+${top}`, line,
      );
    }
  }

  args.push(output);
  await execFileAsync("magick", args);
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
    if (!translations[locale] && !translations.en) throw new Error(`No translations configured for locale: ${locale}`);
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
        const overlay = join(temp, `${device}-${locale}-${artboard.index}.png`);
        await renderOverlay(artboard, locale, overlay);
        await execFileAsync("magick", [input, "-background", "none", overlay, "-compose", "over", "-composite", output]);
      }
    }
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log(`Rendered ${locales.length} locale(s) × 2 devices × 5 screenshots.`);
