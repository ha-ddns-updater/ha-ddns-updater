#!/usr/bin/env node

import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";

const CONFIG_PATH = "ddns-updater/config.yaml";
const ICON_PATH = "ddns-updater/icon.png";
const LOGO_PATH = "ddns-updater/logo.png";

function parseArgs(argv) {
  const args = {
    upstreamDir: "",
    write: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--upstream-dir") {
      args.upstreamDir = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--write") {
      args.write = true;
    }
  }

  if (!args.upstreamDir) {
    throw new Error("Missing required --upstream-dir <path>");
  }

  return args;
}

function readUpstreamVersionFromConfig() {
  const config = readFileSync(CONFIG_PATH, "utf8");
  const match = config.match(/^version:\s*"(\d+\.\d+\.\d+)-ha\d+\.\d+\.\d+"$/m);
  if (!match) {
    throw new Error(`Could not parse upstream version from ${CONFIG_PATH}`);
  }
  return match[1];
}

function writeOutputs(outputs) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;

  for (const [key, value] of Object.entries(outputs)) {
    appendFileSync(outputPath, `${key}=${value}\n`);
  }
}

async function renderAsset(svg, width, height) {
  return sharp(Buffer.from(svg, "utf8"))
    .resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function hasChanged(targetPath, nextContent) {
  if (!existsSync(targetPath)) {
    return true;
  }
  const current = readFileSync(targetPath);
  return !current.equals(nextContent);
}

function writeFileIfChanged(targetPath, nextContent, write) {
  const changed = hasChanged(targetPath, nextContent);
  if (changed && write) {
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, nextContent);
  }
  return changed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const upstreamVersion = readUpstreamVersionFromConfig();

  const upstreamSvgPath = resolve(join(args.upstreamDir, "readme/ddnsgopher.svg"));
  const svg = readFileSync(upstreamSvgPath, "utf8");

  const iconBuffer = await renderAsset(svg, 128, 128);
  const logoBuffer = await renderAsset(svg, 250, 100);

  const iconChanged = writeFileIfChanged(ICON_PATH, iconBuffer, args.write);
  const logoChanged = writeFileIfChanged(LOGO_PATH, logoBuffer, args.write);
  const assetsChanged = iconChanged || logoChanged;

  writeOutputs({
    upstream_version: upstreamVersion,
    assets_changed: String(assetsChanged),
    icon_changed: String(iconChanged),
    logo_changed: String(logoChanged),
  });

  if (!assetsChanged) {
    console.log("Brand assets are already up-to-date.");
    return;
  }

  if (!args.write) {
    console.log("Brand asset changes detected (dry run).");
    return;
  }

  console.log("Updated ddns-updater/icon.png and ddns-updater/logo.png");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
