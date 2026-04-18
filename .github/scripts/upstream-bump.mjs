#!/usr/bin/env node

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

const TAGS_URL = "https://hub.docker.com/v2/repositories/qmcgaw/ddns-updater/tags?page_size=100";
const DOCKERFILE_PATH = "ddns-updater/Dockerfile";
const CONFIG_PATH = "ddns-updater/config.yaml";

function semverKey(version) {
  return version.split(".").map((part) => Number(part));
}

function compareVersionsDesc(a, b) {
  const [aMaj, aMin, aPatch] = semverKey(a);
  const [bMaj, bMin, bPatch] = semverKey(b);
  if (aMaj !== bMaj) return bMaj - aMaj;
  if (aMin !== bMin) return bMin - aMin;
  return bPatch - aPatch;
}

async function fetchLatestUpstreamPatchVersion() {
  let url = TAGS_URL;
  const versions = new Set();

  while (url) {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tags from Docker Hub: HTTP ${response.status}`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload.results) ? payload.results : [];

    for (const result of results) {
      const tag = String(result?.name ?? "");
      if (tag === "latest") continue;

      const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
      if (!match) continue;

      versions.add(`${match[1]}.${match[2]}.${match[3]}`);
    }

    url = payload.next ?? null;
  }

  if (versions.size === 0) {
    throw new Error("No upstream patch versions matching v?X.Y.Z were found");
  }

  return [...versions].sort(compareVersionsDesc)[0];
}

function readCurrentDockerfileVersion() {
  const dockerfile = readFileSync(DOCKERFILE_PATH, "utf8");
  const match = dockerfile.match(/^FROM docker\.io\/qmcgaw\/ddns-updater:(.+)$/m);
  if (!match) {
    throw new Error(`Could not find upstream FROM line in ${DOCKERFILE_PATH}`);
  }
  return match[1].trim();
}

function writeOutputs(outputs) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;

  for (const [key, value] of Object.entries(outputs)) {
    appendFileSync(outputPath, `${key}=${value}\n`);
  }
}

function updateDockerfile(newVersion) {
  const dockerfile = readFileSync(DOCKERFILE_PATH, "utf8");
  const updatedDockerfile = dockerfile.replace(
    /^FROM docker\.io\/qmcgaw\/ddns-updater:.+$/m,
    `FROM docker.io/qmcgaw/ddns-updater:${newVersion}`,
  );

  if (updatedDockerfile === dockerfile) {
    throw new Error(`Failed to update FROM line in ${DOCKERFILE_PATH}`);
  }

  writeFileSync(DOCKERFILE_PATH, updatedDockerfile);
}

function updateConfigYaml(newVersion) {
  const config = readFileSync(CONFIG_PATH, "utf8");
  const updatedConfig = config.replace(
    /^version:\s*".*"$/m,
    `version: "${newVersion}-ha1"`,
  );

  if (updatedConfig === config) {
    throw new Error(`Failed to update version field in ${CONFIG_PATH}`);
  }

  writeFileSync(CONFIG_PATH, updatedConfig);
}

async function main() {
  const writeChanges = process.argv.includes("--write");

  const upstreamVersion = await fetchLatestUpstreamPatchVersion();
  const currentVersion = readCurrentDockerfileVersion();
  const updateNeeded = upstreamVersion !== currentVersion;

  writeOutputs({
    upstream_version: upstreamVersion,
    current_version: currentVersion,
    update_needed: String(updateNeeded),
  });

  if (!updateNeeded) {
    console.log(`Already up-to-date at ${currentVersion}`);
    return;
  }

  console.log(`New upstream version found: ${currentVersion} -> ${upstreamVersion}`);

  if (writeChanges) {
    updateDockerfile(upstreamVersion);
    updateConfigYaml(upstreamVersion);
    console.log(`Updated ${DOCKERFILE_PATH} and ${CONFIG_PATH}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
