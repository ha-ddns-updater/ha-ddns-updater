#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const CONFIG_PATH = "ddns-updater/config.yaml";

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

function updateConfigVersion(nextAddonVersion) {
  validateAddonVersion(nextAddonVersion);

  const config = readFileSync(CONFIG_PATH, "utf8");
  const current = parseVersion(config);
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

function main() {
  const nextAddonVersion = process.argv[2];
  if (!nextAddonVersion) {
    throw new Error("Usage: node .github/scripts/prepare-addon-release.mjs <addon-version>");
  }

  updateConfigVersion(nextAddonVersion);
}

main();
