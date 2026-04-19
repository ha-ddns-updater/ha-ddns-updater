#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const CONFIG_PATH = "ddns-updater/config.yaml";
const RELEASERC_PATH = ".releaserc.cjs";

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function parseConfigVersion() {
  const config = readFileSync(CONFIG_PATH, "utf8");
  const match = config.match(/^version:\s*"(\d+\.\d+\.\d+)-ha(\d+\.\d+\.\d+)"$/m);
  if (!match) {
    throw new Error(`Could not parse version from ${CONFIG_PATH}; expected X.Y.Z-haA.B.C`);
  }

  return {
    upstream: match[1],
    addon: match[2],
  };
}

function readTagPrefixFromReleaserc() {
  const require = createRequire(import.meta.url);
  const config = require(`${process.cwd()}/${RELEASERC_PATH}`);
  const tagFormat = String(config?.tagFormat ?? "");
  if (!tagFormat.includes("${version}")) {
    throw new Error("tagFormat in " + RELEASERC_PATH + " must contain ${version}");
  }

  return tagFormat.replace("${version}", "");
}

function tagExists(tag) {
  try {
    const found = runGit(["tag", "--list", tag]);
    return found === tag;
  } catch {
    return false;
  }
}

function findSourceTag(addonVersion) {
  const query = `*-ha${addonVersion}`;
  const tags = runGit(["tag", "--list", query, "--sort=-version:refname"])
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags[0] ?? "";
}

function ensureBaselineTag() {
  const { addon } = parseConfigVersion();
  const tagPrefix = readTagPrefixFromReleaserc();
  const expectedTag = `${tagPrefix}${addon}`;

  if (tagExists(expectedTag)) {
    console.log(`Baseline tag already present: ${expectedTag}`);
    return;
  }

  const sourceTag = findSourceTag(addon);
  if (!sourceTag) {
    console.log(
      `No existing tag found for add-on version ${addon}; skipping baseline tag creation (${expectedTag}).`,
    );
    return;
  }

  const sourceSha = runGit(["rev-list", "-n", "1", sourceTag]);
  runGit(["tag", expectedTag, sourceSha]);
  console.log(`Created baseline tag ${expectedTag} from ${sourceTag} (${sourceSha.slice(0, 7)})`);
}

ensureBaselineTag();
