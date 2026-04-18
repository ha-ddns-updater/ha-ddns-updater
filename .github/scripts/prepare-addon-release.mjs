#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const CONFIG_PATH = "ddns-updater/config.yaml";
const CHANGELOG_PATH = "ddns-updater/CHANGELOG.md";

function parseVersion(configContent) {
  const match = configContent.match(/^version:\s*"(\d+\.\d+\.\d+)-ha(\d+\.\d+\.\d+)"$/m);
  if (!match) {
    throw new Error(`Could not parse version from ${CONFIG_PATH}; expected format X.Y.Z-haA.B.C`);
  }

  return {
    upstream: match[1],
    addon: match[2],
  };
}

function validateAddonVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid addon version ${JSON.stringify(version)}; expected A.B.C`);
  }
}

function normalizeAddonVersion(inputVersion) {
  const fullVersionMatch = /^(\d+\.\d+\.\d+)-ha(\d+\.\d+\.\d+)$/.exec(inputVersion);
  if (fullVersionMatch) {
    return fullVersionMatch[2];
  }

  return inputVersion;
}

function updateConfigVersion(nextAddonVersion) {
  validateAddonVersion(nextAddonVersion);

  const config = readFileSync(CONFIG_PATH, "utf8");
  const current = parseVersion(config);

  if (current.addon === nextAddonVersion) {
    console.log(`No update needed for ${CONFIG_PATH}: already at ${current.upstream}-ha${current.addon}`);
    return;
  }

  const nextFullVersion = `${current.upstream}-ha${nextAddonVersion}`;

  const updatedConfig = config.replace(
    /^version:\s*".*"$/m,
    `version: "${nextFullVersion}"`,
  );

  if (updatedConfig === config) {
    throw new Error(`No version line was updated in ${CONFIG_PATH}`);
  }

  writeFileSync(CONFIG_PATH, updatedConfig);

  console.log(`Updated ${CONFIG_PATH}: ${current.upstream}-ha${current.addon} -> ${nextFullVersion}`);
}

function patchChangelog(addonOnlyVersion, fullGitTag) {
  let changelog;
  try {
    changelog = readFileSync(CHANGELOG_PATH, "utf8");
  } catch {
    // Changelog may not exist on first run; nothing to patch.
    return;
  }

  // Replace the section header that uses the addon-only version with the full tag.
  // Targets lines like: ## [1.0.5](...) or # [1.0.5](...)
  const escaped = addonOnlyVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patched = changelog.replace(
    new RegExp(`(#{1,3} \\[?)${escaped}(\\])`, "g"),
    `$1${fullGitTag}$2`,
  );

  if (patched !== changelog) {
    writeFileSync(CHANGELOG_PATH, patched);
    console.log(`Patched ${CHANGELOG_PATH}: replaced ${addonOnlyVersion} → ${fullGitTag} in headers`);
  }
}

function main() {
  const requestedVersion = process.argv[2];
  if (!requestedVersion) {
    throw new Error(
      "Usage: node .github/scripts/prepare-addon-release.mjs <addon-version|full-version> [git-tag]",
    );
  }

  const fullGitTag = process.argv[3] ?? null;
  const nextAddonVersion = normalizeAddonVersion(requestedVersion);
  updateConfigVersion(nextAddonVersion);

  if (fullGitTag) {
    patchChangelog(nextAddonVersion, fullGitTag);
  }
}

main();
