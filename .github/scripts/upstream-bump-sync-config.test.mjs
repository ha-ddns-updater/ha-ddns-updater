import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT_PATH = new URL("./upstream-bump-sync-config.mjs", import.meta.url);

function writeUpstreamFixture(
  upstreamDir,
  {
    providers = [
      { constName: "ProviderDuckDNS", slug: "duckdns", dir: "duckdns" },
    ],
    providerFiles = {
      duckdns: `package duckdns

func validate(token string) error {
  if token == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  Token string \`json:"token"\`
}
`,
    },
    readmeEnvKeys = ["PERIOD"],
    goEnvKeys = ["PERIOD"],
  } = {},
) {
  mkdirSync(join(upstreamDir, "internal/provider/constants"), { recursive: true });
  mkdirSync(join(upstreamDir, "internal/config"), { recursive: true });
  for (const provider of providers) {
    mkdirSync(join(upstreamDir, `internal/provider/providers/${provider.dir}`), {
      recursive: true,
    });
  }

  const providerConstants = providers
    .map((provider) => `  ${provider.constName} models.Provider = "${provider.slug}"`)
    .join("\n");

  writeFileSync(
    join(upstreamDir, "internal/provider/constants/providers.go"),
    `package constants\n\nimport \"github.com/qdm12/ddns-updater/internal/models\"\n\nconst (\n${providerConstants}\n)\n`,
    "utf8",
  );

  for (const provider of providers) {
    writeFileSync(
      join(upstreamDir, `internal/provider/providers/${provider.dir}/provider.go`),
      providerFiles[provider.dir],
      "utf8",
    );
  }

  const goEnvCalls = goEnvKeys.map((key) => `  _ = reader.String("${key}")`).join("\n");

  writeFileSync(
    join(upstreamDir, "internal/config/pubip.go"),
    `package config\n\nfunc parse(reader interface{ String(string, ...string) string }) {\n${goEnvCalls}\n}\n`,
    "utf8",
  );

  const readmeRows = readmeEnvKeys
    .map((key) => `| \`${key}\` | ${key.toLowerCase()} |`)
    .join("\n");

  writeFileSync(
    join(upstreamDir, "README.md"),
    `| Environment variable | Description |\n| --- | --- |\n${readmeRows}\n`,
    "utf8",
  );
}

function writeConfig(configPath) {
  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "description: test",
      "arch:",
      "  - amd64",
      "url: https://example.com",
      "ingress: true",
      "options:",
      "  environments:",
      '    PERIOD: "5m"',
      "  settings:",
      "    - domain: example.com",
      "      provider: duckdns",
      "      token: test",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "    OLD_ENV: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(duckdns)",
      "      token: str?",
      "image: docker.io/qmcgaw/ddns-updater:2.9.0",
      "",
    ].join("\n"),
    "utf8",
  );
}

function writeTranslations(translationPath) {
  writeFileSync(
    translationPath,
    [
      "configuration:",
      "  environments:",
      '    name: "Environment variables"',
      '    description: "Environment variables passed to ddns-updater."',
      "    fields:",
      "      PERIOD:",
      '        name: "PERIOD"',
      '        description: "Interval between update checks. Default: 5m."',
      "      RESOLVER_TIMEOUT:",
      '        name: "RESOLVER_TIMEOUT"',
      '        description: "Timeout used for resolver lookups when RESOLVER_ADDRESS is set. Default: 5s."',
      "  settings:",
      '    name: "Provider settings"',
      '    description: "List of DNS provider configurations."',
      "    fields:",
      "      domain:",
      '        name: "Domain"',
      '        description: "Domain or host to update (required: all providers)."',
      "      provider:",
      '        name: "Provider"',
      '        description: "DNS provider slug used for this item (required: all providers)."',
      "      owner:",
      '        name: "Owner"',
      '        description: "Legacy owner/host field (optional: all providers)."',
      "      ip_version:",
      '        name: "IP version"',
      '        description: "Which IP family to update (optional: all providers)."',
      "      ipv6_suffix:",
      '        name: "IPv6 suffix"',
      '        description: "IPv6 network prefix/suffix used when matching IPv6 addresses (optional: all providers)."',
      "      token:",
      '        name: "Token"',
      '        description: "API token credential (required: DuckDNS)."',
      "",
    ].join("\n"),
    "utf8",
  );
}

function topLevelKeys(yamlText) {
  return yamlText
    .split("\n")
    .map((line) => line.match(/^([a-z_][a-z0-9_]*):/i)?.[1])
    .filter(Boolean);
}

function schemaBlock(yamlText) {
  const lines = yamlText.split("\n");
  const start = lines.findIndex((line) => line === "schema:");
  if (start === -1) return [];
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (line && !line.startsWith(" ")) break;
    block.push(line);
  }
  return block;
}

function extractEnvSchemaMap(yamlText) {
  const result = new Map();
  for (const line of schemaBlock(yamlText)) {
    const m = line.match(/^(?:\x20){4}([A-Z][A-Z0-9_]+):\s*(.+)$/);
    if (m) result.set(m[1], m[2]);
  }
  return result;
}

function extractSettingsFieldOrder(yamlText) {
  const order = [];
  for (const line of schemaBlock(yamlText)) {
    const first = line.match(/^(?:\x20){4}-\s+([a-z][a-z0-9_]*):\s*(.+)$/);
    if (first) {
      order.push(first[1]);
      continue;
    }
    const next = line.match(/^(?:\x20){6}([a-z][a-z0-9_]*):\s*(.+)$/);
    if (next) order.push(next[1]);
  }
  return order;
}

function extractSettingsConstraints(yamlText) {
  const result = new Map();
  for (const line of schemaBlock(yamlText)) {
    const first = line.match(/^(?:\x20){4}-\s+([a-z][a-z0-9_]*):\s*(.+)$/);
    if (first) {
      result.set(first[1], first[2]);
      continue;
    }
    const next = line.match(/^(?:\x20){6}([a-z][a-z0-9_]*):\s*(.+)$/);
    if (next) result.set(next[1], next[2]);
  }
  return result;
}

test("preserves top-level key order while mutating schema via YAML object updates", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const addonDir = fixtureDir;
  const configPath = join(addonDir, "ddns-updater/config.yaml");
  const translationPath = join(addonDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(addonDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(addonDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });
  writeUpstreamFixture(upstreamDir);
  writeConfig(configPath);
  writeTranslations(translationPath);

  const before = readFileSync(configPath, "utf8");
  const beforeKeys = topLevelKeys(before);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: addonDir,
      env: process.env,
      stdio: "pipe",
    });

    const after = readFileSync(configPath, "utf8");
    const afterKeys = topLevelKeys(after);

    assert.deepEqual(afterKeys, beforeKeys);
    assert.match(after, /schema:\n  environments:\n    PERIOD: str\?/);
    assert.doesNotMatch(after, /OLD_ENV:/);
    assert.match(after, /settings:\n    - domain: str\n      provider: list\(duckdns\)\n      owner: str\?/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("fails with missing schema section", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });
  writeUpstreamFixture(upstreamDir);
  writeTranslations(translationPath);

  writeFileSync(configPath, 'name: DDNS Updater\nversion: "2.9.0-ha1.7.3"\n', "utf8");

  try {
    assert.throws(() => {
      execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
        cwd: fixtureDir,
        env: process.env,
        stdio: "pipe",
      });
    });
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("keeps Go-only env vars and applies AGENTS env constraints for new README vars", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });
  writeUpstreamFixture(upstreamDir, {
    readmeEnvKeys: ["PERIOD", "UMASK"],
    goEnvKeys: ["PERIOD", "RESOLVER_TIMEOUT"],
  });

  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "    RESOLVER_TIMEOUT: str?",
      "    OLD_ENV: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(duckdns)",
      "      token: str?",
      "",
    ].join("\n"),
    "utf8",
  );
  writeTranslations(translationPath);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const after = readFileSync(configPath, "utf8");
    const envs = extractEnvSchemaMap(after);
    assert.equal(envs.get("RESOLVER_TIMEOUT"), "str?");
    assert.equal(envs.get("UMASK"), "match(^[0-7]{3,4}$)?");
    assert.equal(envs.has("OLD_ENV"), false);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("excludes addon-managed env vars from schema and translations", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });

  writeUpstreamFixture(upstreamDir, {
    readmeEnvKeys: ["PERIOD", "ROOT_URL", "DATADIR"],
    goEnvKeys: ["PERIOD", "ROOT_URL", "DATADIR", "CONFIG_FILEPATH", "BACKUP_DIRECTORY"],
  });
  writeConfig(configPath);
  writeTranslations(translationPath);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const afterConfig = readFileSync(configPath, "utf8");
    const afterTranslations = readFileSync(translationPath, "utf8");

    assert.doesNotMatch(afterConfig, /ROOT_URL:/);
    assert.doesNotMatch(afterConfig, /DATADIR:/);
    assert.doesNotMatch(afterConfig, /CONFIG_FILEPATH:/);
    assert.doesNotMatch(afterConfig, /BACKUP_DIRECTORY:/);

    assert.doesNotMatch(afterTranslations, /\n\s+ROOT_URL:/);
    assert.doesNotMatch(afterTranslations, /\n\s+DATADIR:/);
    assert.doesNotMatch(afterTranslations, /\n\s+CONFIG_FILEPATH:/);
    assert.doesNotMatch(afterTranslations, /\n\s+BACKUP_DIRECTORY:/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("orders settings fields per AGENTS grouping and applies constrained field types", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });
  writeUpstreamFixture(upstreamDir, {
    providers: [
      { constName: "ProviderAlpha", slug: "alpha", dir: "alpha" },
      { constName: "ProviderBeta", slug: "beta", dir: "beta" },
      { constName: "ProviderNameCom", slug: "name.com", dir: "namecom" },
    ],
    providerFiles: {
      alpha: `package alpha

var modeRegex struct { MatchString func(string) bool }

func validate(password, mode string, ttl uint32, url string) error {
  if password == "" {
    return nil
  }
  if !modeRegex.MatchString(mode) {
    return nil
  }
  _ = ttl
  _ = url
  return nil
}

var extraSettings struct {
  Password string \`json:"password"\`
  Mode string \`json:"mode"\`
  TTL uint32 \`json:"ttl"\`
  URL string \`json:"url"\`
}
`,
      beta: `package beta

func validate(password, token string, ttl uint32) error {
  if password == "" {
    return nil
  }
  if token == "" {
    return nil
  }
  _ = ttl
  return nil
}

var extraSettings struct {
  Password string \`json:"password"\`
  Token string \`json:"token"\`
  TTL uint32 \`json:"ttl"\`
}
`,
      namecom: `package namecom

var extraSettings struct {
  TTL uint32 \`json:"ttl"\`
}
`,
    },
  });

  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(alpha)",
      "",
    ].join("\n"),
    "utf8",
  );
  writeTranslations(translationPath);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const after = readFileSync(configPath, "utf8");
    const order = extractSettingsFieldOrder(after);
    const constraints = extractSettingsConstraints(after);

    assert.deepEqual(order, [
      "domain",
      "provider",
      "owner",
      "ip_version",
      "ipv6_suffix",
      "password",
      "mode",
      "token",
      "ttl",
      "url",
    ]);
    assert.equal(constraints.get("provider"), "list(alpha|beta|namecom)");
    assert.equal(constraints.get("mode"), "match(^(api|dyndns)$)?");
    assert.equal(constraints.get("ttl"), "int(1,4294967295)?");
    assert.equal(constraints.get("url"), "match(^https://.+$)?");
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("orders api_key above email based on required-provider count", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });

  writeUpstreamFixture(upstreamDir, {
    providers: [
      { constName: "ProviderA", slug: "a", dir: "a" },
      { constName: "ProviderB", slug: "b", dir: "b" },
      { constName: "ProviderC", slug: "c", dir: "c" },
      { constName: "ProviderD", slug: "d", dir: "d" },
      { constName: "ProviderE", slug: "e", dir: "e" },
    ],
    providerFiles: {
      a: `package a

func validate(apiKey string) error {
  if apiKey == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  APIKey string \`json:"api_key"\`
}
`,
      b: `package b

func validate(apiKey string) error {
  if apiKey == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  APIKey string \`json:"api_key"\`
}
`,
      c: `package c

func validate(apiKey string) error {
  if apiKey == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  APIKey string \`json:"api_key"\`
}
`,
      d: `package d

func validate(email string) error {
  if email == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  Email string \`json:"email"\`
}
`,
      e: `package e

func validate(email string) error {
  if email == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  Email string \`json:"email"\`
}
`,
    },
  });

  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(a|b|c|d|e)",
      "",
    ].join("\n"),
    "utf8",
  );
  writeTranslations(translationPath);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const order = extractSettingsFieldOrder(readFileSync(configPath, "utf8"));
    assert.ok(order.indexOf("api_key") < order.indexOf("email"));
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("uses key-name ascending as tertiary sort when count and first provider tie", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });

  writeUpstreamFixture(upstreamDir, {
    providers: [{ constName: "ProviderAlpha", slug: "alpha", dir: "alpha" }],
    providerFiles: {
      alpha: `package alpha

func validate(apple, zebra string) error {
  if apple == "" {
    return nil
  }
  if zebra == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  Zebra string \`json:"zebra"\`
  Apple string \`json:"apple"\`
}
`,
    },
  });

  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(alpha)",
      "",
    ].join("\n"),
    "utf8",
  );
  writeTranslations(translationPath);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const order = extractSettingsFieldOrder(readFileSync(configPath, "utf8"));
    assert.ok(order.indexOf("apple") < order.indexOf("zebra"));
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("reorders existing misordered settings even without add/remove changes", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });

  writeUpstreamFixture(upstreamDir, {
    providers: [
      { constName: "ProviderA", slug: "a", dir: "a" },
      { constName: "ProviderB", slug: "b", dir: "b" },
      { constName: "ProviderC", slug: "c", dir: "c" },
      { constName: "ProviderD", slug: "d", dir: "d" },
      { constName: "ProviderE", slug: "e", dir: "e" },
    ],
    providerFiles: {
      a: `package a

func validate(apiKey string) error {
  if apiKey == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  APIKey string \`json:"api_key"\`
}
`,
      b: `package b

func validate(apiKey string) error {
  if apiKey == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  APIKey string \`json:"api_key"\`
}
`,
      c: `package c

func validate(apiKey string) error {
  if apiKey == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  APIKey string \`json:"api_key"\`
}
`,
      d: `package d

func validate(email string) error {
  if email == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  Email string \`json:"email"\`
}
`,
      e: `package e

func validate(email string) error {
  if email == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  Email string \`json:"email"\`
}
`,
    },
  });

  // Intentionally wrong order: email before api_key.
  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(a|b|c|d|e)",
      "      owner: str?",
      "      ip_version: list(ipv4|ipv6|ipv4or6)?",
      "      ipv6_suffix: match(^[0-9A-Fa-f:]+/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$)?",
      "      email: str?",
      "      api_key: str?",
      "",
    ].join("\n"),
    "utf8",
  );
  writeTranslations(translationPath);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const order = extractSettingsFieldOrder(readFileSync(configPath, "utf8"));
    assert.ok(order.indexOf("api_key") < order.indexOf("email"));
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("keeps ovh mode and api_endpoint in required group before optional user", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });

  writeUpstreamFixture(upstreamDir, {
    providers: [
      { constName: "ProviderOVH", slug: "ovh", dir: "ovh" },
      { constName: "ProviderSpdyn", slug: "spdyn", dir: "spdyn" },
    ],
    providerFiles: {
      ovh: `package ovh

func validate(mode, apiEndpoint string) error {
  if mode == "api" && apiEndpoint == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  Mode string \`json:"mode"\`
  APIEndpoint string \`json:"api_endpoint"\`
}
`,
      spdyn: `package spdyn

func validate(token, user string) error {
  if token == "" && user == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  User string \`json:"user"\`
}
`,
    },
  });

  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(ovh|spdyn)",
      "",
    ].join("\n"),
    "utf8",
  );
  writeTranslations(translationPath);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const order = extractSettingsFieldOrder(readFileSync(configPath, "utf8"));
    assert.ok(order.indexOf("mode") < order.indexOf("user"));
    assert.ok(order.indexOf("api_endpoint") < order.indexOf("user"));
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("keeps required subset fields above optional subset fields (region/ipv6key vs zone_identifier/ttl)", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });

  writeUpstreamFixture(upstreamDir, {
    providers: [
      { constName: "ProviderAliyun", slug: "aliyun", dir: "aliyun" },
      { constName: "ProviderCustom", slug: "custom", dir: "custom" },
      { constName: "ProviderCloudflare", slug: "cloudflare", dir: "cloudflare" },
      { constName: "ProviderHetzner", slug: "hetzner", dir: "hetzner" },
      { constName: "ProviderRoute53", slug: "route53", dir: "route53" },
    ],
    providerFiles: {
      aliyun: `package aliyun

func validate(region string) error {
  if region == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  Region string \`json:"region"\`
}
`,
      custom: `package custom

func validate(ipv6key string) error {
  if ipv6key == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  IPv6Key string \`json:"ipv6key"\`
}
`,
      cloudflare: `package cloudflare

func validate(zoneIdentifier string, ttl uint32) error {
  if zoneIdentifier == "" {
    return nil
  }
  if ttl == 0 {
    return nil
  }
  return nil
}

var extraSettings struct {
  ZoneIdentifier string \`json:"zone_identifier"\`
  TTL uint32 \`json:"ttl"\`
}
`,
      hetzner: `package hetzner

var extraSettings struct {
  ZoneIdentifier string \`json:"zone_identifier"\`
  TTL uint32 \`json:"ttl"\`
}
`,
      route53: `package route53

var extraSettings struct {
  TTL uint32 \`json:"ttl"\`
}
`,
    },
  });

  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(aliyun|custom|cloudflare|hetzner|route53)",
      "",
    ].join("\n"),
    "utf8",
  );
  writeTranslations(translationPath);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const order = extractSettingsFieldOrder(readFileSync(configPath, "utf8"));
    assert.ok(order.indexOf("region") < order.indexOf("zone_identifier"));
    assert.ok(order.indexOf("ipv6key") < order.indexOf("ttl"));
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("places custom success_regex and url above optional ttl", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });

  writeUpstreamFixture(upstreamDir, {
    providers: [
      { constName: "ProviderCustom", slug: "custom", dir: "custom" },
      { constName: "ProviderRoute53", slug: "route53", dir: "route53" },
    ],
    providerFiles: {
      custom: `package custom

func validate(url, successRegex string) error {
  if url == "" {
    return nil
  }
  if successRegex == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  URL string \`json:"url"\`
  SuccessRegex string \`json:"success_regex"\`
}
`,
      route53: `package route53

var extraSettings struct {
  TTL uint32 \`json:"ttl"\`
}
`,
    },
  });

  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(custom|route53)",
      "",
    ].join("\n"),
    "utf8",
  );
  writeTranslations(translationPath);

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const order = extractSettingsFieldOrder(readFileSync(configPath, "utf8"));
    assert.ok(order.indexOf("success_regex") < order.indexOf("ttl"));
    assert.ok(order.indexOf("url") < order.indexOf("ttl"));
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("does not mutate config file in dry-run mode", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });
  writeUpstreamFixture(upstreamDir, {
    readmeEnvKeys: ["PERIOD", "UMASK"],
    goEnvKeys: ["PERIOD"],
  });
  writeConfig(configPath);
  writeTranslations(translationPath);

  const before = readFileSync(configPath, "utf8");
  const beforeTranslation = readFileSync(translationPath, "utf8");

  try {
    const output = execFileSync(
      "node",
      [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--dry-run"],
      {
        cwd: fixtureDir,
        env: process.env,
        stdio: "pipe",
        encoding: "utf8",
      },
    );
    const after = readFileSync(configPath, "utf8");
    const afterTranslation = readFileSync(translationPath, "utf8");

    assert.equal(after, before);
    assert.equal(afterTranslation, beforeTranslation);
    assert.match(output, /config_changed: true/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("generates en.yaml entries for new env and settings fields", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });

  writeUpstreamFixture(upstreamDir, {
    readmeEnvKeys: ["PERIOD", "UMASK"],
    providers: [{ constName: "ProviderDuckDNS", slug: "duckdns", dir: "duckdns" }],
    providerFiles: {
      duckdns: `package duckdns

func validate(token string) error {
  if token == "" {
    return nil
  }
  return nil
}

var extraSettings struct {
  Token string \`json:"token"\`
  ClientKey string \`json:"client_key"\`
}
`,
    },
  });

  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(duckdns)",
      "      token: str?",
      "",
    ].join("\n"),
    "utf8",
  );

  writeFileSync(
    translationPath,
    [
      "configuration:",
      "  environments:",
      '    name: "Environment variables"',
      '    description: "Environment variables passed to ddns-updater."',
      "    fields:",
      "      PERIOD:",
      '        name: "PERIOD"',
      '        description: "Interval between update checks. Default: 5m."',
      "  settings:",
      '    name: "Provider settings"',
      '    description: "List of DNS provider configurations."',
      "    fields:",
      "      domain:",
      '        name: "Domain"',
      '        description: "Domain or host to update (required: all providers)."',
      "      provider:",
      '        name: "Provider"',
      '        description: "DNS provider slug used for this item (required: all providers)."',
      "      owner:",
      '        name: "Owner"',
      '        description: "Legacy owner/host field (optional: all providers)."',
      "      ip_version:",
      '        name: "IP version"',
      '        description: "Which IP family to update (optional: all providers)."',
      "      ipv6_suffix:",
      '        name: "IPv6 suffix"',
      '        description: "IPv6 network prefix/suffix used when matching IPv6 addresses (optional: all providers)."',
      "      token:",
      '        name: "Token"',
      '        description: "API token credential (required: DuckDNS)."',
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    execFileSync("node", [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"], {
      cwd: fixtureDir,
      env: process.env,
      stdio: "pipe",
    });

    const after = readFileSync(translationPath, "utf8");
    assert.match(after, /UMASK:[\s\S]*name: UMASK/);
    assert.match(after, /UMASK:[\s\S]*description: umask\./i);
    assert.match(after, /client_key:[\s\S]*name: Client Key/);
    assert.match(after, /client_key:[\s\S]*description: "Client Key setting \(optional: all providers\)\."/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("write mode rewrites files even when no semantic changes are detected", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ha-ddns-updater-sync-config-test-"));
  const upstreamDir = join(fixtureDir, "upstream");
  const configPath = join(fixtureDir, "ddns-updater/config.yaml");
  const translationPath = join(fixtureDir, "ddns-updater/translations/en.yaml");

  mkdirSync(join(fixtureDir, "ddns-updater"), { recursive: true });
  mkdirSync(join(fixtureDir, "ddns-updater/translations"), { recursive: true });
  mkdirSync(upstreamDir, { recursive: true });
  writeUpstreamFixture(upstreamDir);

  writeFileSync(
    configPath,
    [
      "name: DDNS Updater",
      'version: "2.9.0-ha1.7.3"',
      "slug: ddns_updater",
      "schema:",
      "  environments:",
      "    PERIOD: str?",
      "  settings:",
      "    - domain: str",
      "      provider: list(duckdns)",
      "      owner: str?",
      "      ip_version: list(ipv4|ipv6|ipv4or6)?",
      "      ipv6_suffix: match(^[0-9A-Fa-f:]+/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$)?",
      "      token: str?",
      "",
    ].join("\n"),
    "utf8",
  );

  writeFileSync(
    translationPath,
    [
      "configuration:",
      "  environments:",
      '    name: "Environment variables"',
      '    description: "Environment variables passed to ddns-updater."',
      "    fields:",
      "      PERIOD:",
      '        name: "PERIOD"',
      '        description: "Interval between update checks. Default: 5m."',
      "  settings:",
      '    name: "Provider settings"',
      '    description: "List of DNS provider configurations."',
      "    fields:",
      "      domain:",
      '        name: "Domain"',
      '        description: "Domain or host to update (required: all providers)."',
      "      provider:",
      '        name: "Provider"',
      '        description: "DNS provider slug used for this item (required: all providers)."',
      "      owner:",
      '        name: "Owner"',
      '        description: "Legacy owner/host field (optional: all providers)."',
      "      ip_version:",
      '        name: "IP version"',
      '        description: "Which IP family to update (optional: all providers)."',
      "      ipv6_suffix:",
      '        name: "IPv6 suffix"',
      '        description: "IPv6 network prefix/suffix used when matching IPv6 addresses (optional: all providers)."',
      "      token:",
      '        name: "Token"',
      '        description: "API token credential (required: DuckDNS)."',
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    const output = execFileSync(
      "node",
      [SCRIPT_PATH.pathname, "--upstream-dir", upstreamDir, "--write"],
      {
        cwd: fixtureDir,
        env: process.env,
        stdio: "pipe",
        encoding: "utf8",
      },
    );

    assert.match(output, /config_changed: false/);
    assert.match(output, /No semantic changes detected; files rewritten in --write mode\./);
    assert.match(output, /Written: ddns-updater\/config\.yaml/);
    assert.match(output, /Written: ddns-updater\/translations\/en\.yaml/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
