import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT_PATH = new URL("./prepare-addon-release.mjs", import.meta.url);

function setupFixture(configVersion, changelogContent = null) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-release-test-"));
  const updaterDir = join(fixtureDir, "ddns-updater");
  const configPath = join(updaterDir, "config.yaml");
  const changelogPath = join(updaterDir, "CHANGELOG.md");

  mkdirSync(updaterDir, { recursive: true });
  writeFileSync(configPath, `name: DDNS Updater\nversion: "${configVersion}"\n`, "utf8");
  if (changelogContent !== null) {
    writeFileSync(changelogPath, changelogContent, "utf8");
  }

  return { fixtureDir, configPath, changelogPath };
}

test("updates only the addon semver and preserves upstream semver", () => {
  const { fixtureDir, configPath } = setupFixture("2.9.0-ha1.0.4");

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "1.1.0"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const updated = readFileSync(configPath, "utf8");
    assert.match(updated, /version: "2\.9\.0-ha1\.1\.0"/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("succeeds without changes when addon semver already matches", () => {
  const { fixtureDir, configPath } = setupFixture("2.9.0-ha1.0.4");

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "1.0.4"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const updated = readFileSync(configPath, "utf8");
    assert.match(updated, /version: "2\.9\.0-ha1\.0\.4"/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("accepts full version input and applies only addon semver", () => {
  const { fixtureDir, configPath } = setupFixture("2.9.0-ha1.0.4");

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "2.9.0-ha1.1.0"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const updated = readFileSync(configPath, "utf8");
    assert.match(updated, /version: "2\.9\.0-ha1\.1\.0"/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("patches CHANGELOG.md header to use full gitTag when second argument is provided", () => {
  const changelogContent = [
    "# Changelog",
    "",
    "## [1.0.5](https://github.com/example/compare/2.9.0-ha1.0.4...2.9.0-ha1.0.5) (2026-04-19)",
    "",
    "### Bug Fixes",
    "",
    "* some fix ([abc1234](https://github.com/example/commit/abc1234))",
  ].join("\n");

  const { fixtureDir, configPath, changelogPath } = setupFixture("2.9.0-ha1.0.4", changelogContent);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "1.0.5", "2.9.0-ha1.0.5"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const updatedConfig = readFileSync(configPath, "utf8");
    assert.match(updatedConfig, /version: "2\.9\.0-ha1\.0\.5"/);

    const updatedChangelog = readFileSync(changelogPath, "utf8");
    assert.match(updatedChangelog, /## \[2\.9\.0-ha1\.0\.5\]/);
    assert.doesNotMatch(updatedChangelog, /## \[1\.0\.5\]/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("does not patch CHANGELOG.md when second argument is omitted", () => {
  const changelogContent = "## [1.0.5](https://example.com) (2026-04-19)\n";
  const { fixtureDir, changelogPath } = setupFixture("2.9.0-ha1.0.4", changelogContent);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "1.0.5"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const changelog = readFileSync(changelogPath, "utf8");
    assert.match(changelog, /## \[1\.0\.5\]/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("fails on invalid addon semver", () => {
  const { fixtureDir } = setupFixture("2.9.0-ha1.0.4");

  try {
    assert.throws(() => {
      execFileSync("node", [SCRIPT_PATH.pathname, "1.2"], {
        cwd: fixtureDir,
        env: process.env,
        stdio: "pipe",
      });
    });
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
