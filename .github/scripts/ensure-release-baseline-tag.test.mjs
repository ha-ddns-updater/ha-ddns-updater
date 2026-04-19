import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT_PATH = new URL("./ensure-release-baseline-tag.mjs", import.meta.url);

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  }).trim();
}

function setupFixture({ tagFormat, configVersion, sourceTag }) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-baseline-tag-test-"));
  const updaterDir = join(fixtureDir, "ddns-updater");
  mkdirSync(updaterDir, { recursive: true });

  writeFileSync(
    join(fixtureDir, ".releaserc.cjs"),
    `module.exports = { tagFormat: ${JSON.stringify(tagFormat)} };\n`,
    "utf8",
  );
  writeFileSync(
    join(updaterDir, "config.yaml"),
    `name: DDNS Updater\nversion: "${configVersion}"\n`,
    "utf8",
  );

  runGit(fixtureDir, ["init"]);
  runGit(fixtureDir, ["config", "user.email", "test@example.com"]);
  runGit(fixtureDir, ["config", "user.name", "Test User"]);
  runGit(fixtureDir, ["add", "."]);
  runGit(fixtureDir, ["commit", "-m", "chore: fixture"]);

  if (sourceTag) {
    runGit(fixtureDir, ["tag", sourceTag]);
  }

  return fixtureDir;
}

test("creates expected prefix tag from same addon version source tag", () => {
  const fixtureDir = setupFixture({
    tagFormat: "2.10.0-ha${version}",
    configVersion: "2.10.0-ha1.1.0",
    sourceTag: "2.9.0-ha1.1.0",
  });

  try {
    execFileSync("node", [SCRIPT_PATH.pathname], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const oldTagSha = runGit(fixtureDir, ["rev-list", "-n", "1", "2.9.0-ha1.1.0"]);
    const newTagSha = runGit(fixtureDir, ["rev-list", "-n", "1", "2.10.0-ha1.1.0"]);
    assert.equal(newTagSha, oldTagSha);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("does not fail when no source tag is found", () => {
  const fixtureDir = setupFixture({
    tagFormat: "2.10.0-ha${version}",
    configVersion: "2.10.0-ha1.1.0",
    sourceTag: "",
  });

  try {
    execFileSync("node", [SCRIPT_PATH.pathname], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const newTag = runGit(fixtureDir, ["tag", "--list", "2.10.0-ha1.1.0"]);
    assert.equal(newTag, "");
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
