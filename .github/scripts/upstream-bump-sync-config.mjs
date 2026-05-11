#!/usr/bin/env node

/**
 * upstream-bump-sync-config.mjs
 *
 * Reads the upstream qdm12/ddns-updater source and updates:
 *   - ddns-updater/config.yaml: schema.environments + schema.settings
 *   - ddns-updater/translations/en.yaml: environments.fields + settings.fields
 *
 * Usage:
 *   node .github/scripts/upstream-bump-sync-config.mjs --upstream-dir <path> [--dry-run | --write]
 *
 * Options:
 *   --upstream-dir <path>  Path to a checked-out qdm12/ddns-updater repository
 *   --dry-run              Print the change report and outputs only; do not write files
 *   --write                Apply changes and also print the change report
 *
 * Both modes write GITHUB_OUTPUT keys when GITHUB_OUTPUT env var is set:
 *   config_changed=true|false
 *   has_breaking_change=true|false
 *   change_report=<url-encoded JSON>
 */

import { readFileSync, writeFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";

// ── Constants ──────────────────────────────────────────────────────────────────

const CONFIG_PATH = "ddns-updater/config.yaml";
const EN_TRANSLATIONS_PATH = "ddns-updater/translations/en.yaml";

// Managed by addon runtime wiring, not by user options/schema.
const EXCLUDED_ENV_CONSTRAINTS = new Set([
  "ROOT_URL",
  "HEALTH_SERVER_ADDRESS",
  "DATADIR",
  "CONFIG_FILEPATH",
  "BACKUP_DIRECTORY",
]);

// Required-field overrides for known conditional validations that are not expressed
// as direct empty checks in provider validateSettings functions.
const REQUIRED_FIELD_OVERRIDES = new Map([
  // Aliyun defaults region when omitted, but addon ordering policy treats it as
  // provider-specific required metadata for Group 3 stability.
  ["region", new Set(["aliyun"])],
  // Custom provider placeholders are semantically required when templates are used.
  ["ipv4key", new Set(["custom"])],
  ["ipv6key", new Set(["custom"])],
  // Custom provider requires a URL and success matcher in validation.
  ["success_regex", new Set(["custom"])],
  ["url", new Set(["custom"])],
  // OVH API/DynDNS split requires mode and endpoint in API mode.
  ["mode", new Set(["ovh"])],
  ["api_endpoint", new Set(["ovh"])],
]);

const OPTIONAL_FIELD_OVERRIDES = new Map([
  // Cloudflare supports token and user_service_key auth paths, so email is optional.
  ["email", new Set(["cloudflare"])],
  // Cloudflare and Spdyn support alternate credential paths without token.
  ["token", new Set(["cloudflare", "spdyn"])],
  // Cloudflare user service key is one of multiple auth methods.
  ["user_service_key", new Set(["cloudflare"])],
  // Zone identifiers can be auto-discovered (Cloudflare/Hetzner) in addon UX.
  ["zone_identifier", new Set(["cloudflare", "hetzner"])],
  // Cloudflare allows server-side default when ttl is omitted.
  ["ttl", new Set(["cloudflare"])],
  // Spdyn user is only needed when token is not provided.
  ["user", new Set(["spdyn"])],
]);

// Providers excluded from the HA addon list (internal/test-only upstream providers)
const EXCLUDED_PROVIDER_SLUGS = new Set(["example"]);

// ── Embedded constraint ruleset (AGENTS.md "Applied ruleset") ─────────────────
// These are the schema constraints for settings fields in config.yaml.
// Any field not listed here defaults to str? (or bool? if the Go type is bool).

const SETTINGS_FIELD_CONSTRAINTS = {
  // Group 1 – universal required
  domain: "str",
  // provider: derived dynamically from upstream constants
  // Group 2 – universal optional
  owner: "str?",
  ip_version: "list(ipv4|ipv6|ipv4or6)?",
  ipv6_suffix: "match(^[0-9A-Fa-f:]+/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$)?",
  // Provider-specific constrained fields
  url: "match(^https://.+$)?",
  mode: "match(^(api|dyndns)$)?",
  ttl: "int(1,4294967295)?",
  user_service_key: "match(^v1\\.0.+$)?",
};

// Embedded constraint ruleset for schema.environments
// Any env var not listed here gets str? by default.
// Preserved from AGENTS.md; embedded here so no manual re-sync is needed.
const ENV_CONSTRAINTS = {
  SERVER_ENABLED: "list(yes|no)?",
  LOG_LEVEL: "list(debug|info|warn|error)?",
  LOG_CALLER: "list(hidden|short)?",
  UMASK: "match(^[0-7]{3,4}$)?",
  TZ: "match(^$|^([A-Za-z_]+(?:/[A-Za-z0-9_+\\-]+)+|UTC)$)?",
  PUBLICIP_FETCHERS: "match(^\\s*(all|http|dns)\\s*(,\\s*(all|http|dns)\\s*)*$)?",
  PUBLICIP_HTTP_PROVIDERS:
    "match(^\\s*(all|ipify|ifconfig|ipinfo|spdyn|ipleak|icanhazip|ident|nnev|wtfismyip|seeip|changeip|url:https://[^,\\s]+)\\s*(,\\s*(all|ipify|ifconfig|ipinfo|spdyn|ipleak|icanhazip|ident|nnev|wtfismyip|seeip|changeip|url:https://[^,\\s]+)\\s*)*$)?",
  PUBLICIPV4_HTTP_PROVIDERS:
    "match(^\\s*(all|ipleak|ipify|icanhazip|ident|nnev|wtfismyip|seeip|url:https://[^,\\s]+)\\s*(,\\s*(all|ipleak|ipify|icanhazip|ident|nnev|wtfismyip|seeip|url:https://[^,\\s]+)\\s*)*$)?",
  PUBLICIPV6_HTTP_PROVIDERS:
    "match(^\\s*(all|ipleak|ipify|icanhazip|ident|nnev|wtfismyip|seeip|url:https://[^,\\s]+)\\s*(,\\s*(all|ipleak|ipify|icanhazip|ident|nnev|wtfismyip|seeip|url:https://[^,\\s]+)\\s*)*$)?",
  PUBLICIP_DNS_PROVIDERS:
    "match(^\\s*(all|cloudflare|opendns)\\s*(,\\s*(all|cloudflare|opendns)\\s*)*$)?",
  RESOLVER_ADDRESS: "match(^$|^[^:\\s]+:\\d{1,5}$|^\\[[0-9A-Fa-f:]+\\]:\\d{1,5}$)?",
};

// ── Provider slug parsing ──────────────────────────────────────────────────────

/**
 * Converts an upstream provider slug (e.g. "name.com", "selfhost.de") to
 * the HA-safe form used in config.yaml (remove dots).
 */
function toHaSlug(upstreamSlug) {
  return upstreamSlug.replace(/\./g, "");
}

/**
 * Reads constants/providers.go and returns a sorted list of HA-safe provider slugs,
 * excluding internal-only providers.
 */
function parseProviderSlugs(upstreamDir) {
  const path = join(upstreamDir, "internal/provider/constants/providers.go");
  const content = readFileSync(path, "utf8");

  const slugs = [];
  // Extract all:  SomeConst models.Provider = "slug-value"
  for (const m of content.matchAll(/models\.Provider\s*=\s*"([^"]+)"/g)) {
    const haSlug = toHaSlug(m[1]);
    if (!EXCLUDED_PROVIDER_SLUGS.has(haSlug)) {
      slugs.push(haSlug);
    }
  }

  return [...new Set(slugs)].sort();
}

// ── Provider field extraction ─────────────────────────────────────────────────

/**
 * Converts a Go PascalCase identifier to likely lower-camelCase parameter name.
 * E.g. "AccessKeyID" → "accessKeyID"
 */
function toParamName(goName) {
  const acronymPrefix = goName.match(/^[A-Z]+(?=[A-Z][a-z]|[0-9]|$)/)?.[0] ?? "";
  if (acronymPrefix) {
    return acronymPrefix.toLowerCase() + goName.slice(acronymPrefix.length);
  }
  return goName[0].toLowerCase() + goName.slice(1);
}

/**
 * Converts a JSON snake_case name to camelCase.
 * E.g. "access_key_id" → "accessKeyId"
 */
function toCamelCase(jsonName) {
  return jsonName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Returns true if the given parameter name appears in a required-validation
 * context in the provider.go file content.
 *
 * Heuristics (covers all observed upstream patterns):
 *   • paramName == ""        (string empty check)
 *   • paramName == nil       (pointer nil check)
 *   • len(paramName) == 0    (byte-slice empty check, e.g. GCP credentials)
 */
function isRequiredInFile(paramName, fileContent) {
  // Escape any special regex chars in the param name (all are alphanumeric here)
  const p = paramName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${p}\\s*==\\s*""`),
    new RegExp(`${p}\\s*==\\s*nil\\b`),
    new RegExp(`len\\(${p}\\)\\s*==\\s*0`),
    new RegExp(`!\\s*\\w+\\.MatchString\\([^)]*${p}`),
  ];
  return patterns.some((re) => re.test(fileContent));
}

/**
 * Parses one provider.go file and returns the list of settings fields with metadata.
 * Returns null if no settings struct is found (e.g. providers with no extra config).
 *
 * Each field: { jsonName, goName, isBool, isRequired }
 */
function parseProviderFile(filePath) {
  const content = readFileSync(filePath, "utf8");

  // Find the settings struct.
  // Handles all observed variable names: extraSettings, providerSpecificSettings,
  // and anonymous var declarations.
  const structMatch = content.match(
    /(?:extraSettings|providerSpecificSettings)\s*:?=?\s*(?:var\s+\w+\s+)?struct\s*\{([^}]+)\}/s,
  );
  if (!structMatch) {
    // Some providers declare with: var extraSettings struct { ... }
    // which has the struct keyword separated.  Try a broader pattern.
    const altMatch = content.match(
      /var\s+(?:extraSettings|providerSpecificSettings)\s+struct\s*\{([^}]+)\}/s,
    );
    if (!altMatch) return [];
    return extractFieldsFromStructBody(altMatch[1], content);
  }
  return extractFieldsFromStructBody(structMatch[1], content);
}

function extractFieldsFromStructBody(structBody, fileContent) {
  const fields = [];
  // Match: GoFieldName [*]GoType `json:"name[,omitempty]"`
  for (const m of structBody.matchAll(/(\w+)\s+([\w*./[\]]+)\s+`json:"([^"]+)"`/g)) {
    const goName = m[1];
    const goType = m[2];
    const rawTag = m[3];
    const jsonName = rawTag.replace(",omitempty", "").replace(/,.*$/, "");

    const isBool = goType === "bool" || goType === "*bool";

    // Check required using multiple possible parameter name forms
    const candidateNames = [
      toParamName(goName), // AccessKeyID → accessKeyID
      toCamelCase(jsonName), // access_key_id → accessKeyId
      jsonName.replace(/_/g, ""), // access_key_id → accesskeyid (rare)
    ];
    const isRequired = candidateNames.some((n) => isRequiredInFile(n, fileContent));

    fields.push({ jsonName, goName, isBool, isRequired });
  }
  return fields;
}

// ── Field registry and ordering ───────────────────────────────────────────────

/**
 * Walks all provider directories and builds a registry:
 *   fieldName → { required: Set<haSlug>, optional: Set<haSlug>, isBool: bool }
 *
 * Provider directory → HA slug mapping uses:
 *   1. Provider slug from the upstream constant (via haSlug lookup)
 *   2. Fallback: directory name as-is
 */
function buildFieldRegistry(upstreamDir, providerSlugs) {
  const providersDir = join(upstreamDir, "internal/provider/providers");
  const entries = readdirSync(providersDir).filter((d) => {
    try {
      return statSync(join(providersDir, d)).isDirectory();
    } catch {
      return false;
    }
  });

  // Build a set for fast lookup of valid provider slugs
  const slugSet = new Set(providerSlugs);

  const registry = new Map(); // jsonName → { required: Set, optional: Set, isBool }

  for (const dirName of entries) {
    // Map directory name to HA slug:
    // Most dirs match directly (aliyun, cloudflare…).
    // namecom dir → "name.com" upstream slug → "namecom" HA slug.
    // selfhostde dir → "selfhost.de" upstream slug → "selfhostde" HA slug.
    const haSlug = dirName; // directory names already use the sanitized form

    if (EXCLUDED_PROVIDER_SLUGS.has(haSlug)) continue;
    if (!slugSet.has(haSlug)) continue; // skip unknown/internal dirs

    const providerFile = join(providersDir, dirName, "provider.go");
    let fields;
    try {
      fields = parseProviderFile(providerFile);
    } catch {
      continue;
    }

    for (const { jsonName, isBool, isRequired } of fields) {
      if (!registry.has(jsonName)) {
        registry.set(jsonName, { required: new Set(), optional: new Set(), isBool });
      }
      const entry = registry.get(jsonName);
      if (isRequired) {
        entry.required.add(haSlug);
      } else {
        entry.optional.add(haSlug);
      }
    }
  }

  return registry;
}

function applyRequiredFieldOverrides(registry, providerSlugs) {
  const availableProviders = new Set(providerSlugs);
  for (const [field, providers] of REQUIRED_FIELD_OVERRIDES.entries()) {
    const applicableProviders = [...providers].filter((provider) => availableProviders.has(provider));
    if (applicableProviders.length === 0) continue;

    if (!registry.has(field)) {
      registry.set(field, { required: new Set(), optional: new Set(), isBool: false });
    }
    const entry = registry.get(field);
    for (const provider of applicableProviders) {
      entry.optional.delete(provider);
      entry.required.add(provider);
    }
  }
}

function applyOptionalFieldOverrides(registry, providerSlugs) {
  const availableProviders = new Set(providerSlugs);
  for (const [field, providers] of OPTIONAL_FIELD_OVERRIDES.entries()) {
    const applicableProviders = [...providers].filter((provider) => availableProviders.has(provider));
    if (applicableProviders.length === 0) continue;

    if (!registry.has(field)) {
      registry.set(field, { required: new Set(), optional: new Set(), isBool: false });
    }
    const entry = registry.get(field);
    for (const provider of applicableProviders) {
      entry.required.delete(provider);
      entry.optional.add(provider);
    }
  }
}

/**
 * Sorting comparator for provider list (alphabetical by first provider slug asc).
 * Used within Group 3 and Group 4 as secondary sort.
 */
function firstProviderAlpha(providers) {
  const sorted = [...providers].sort();
  return sorted[0] ?? "";
}

/**
 * Applies the AGENTS.md field ordering rules to produce the ordered list of
 * provider-specific settings fields.
 *
 * Returns an array of { jsonName, constraint } in the correct order.
 * Groups 1 and 2 are handled separately (they're fixed universal fields).
 */
function orderSettingsFields(registry) {
  // AGENTS ordering rules (kept as code comments so AGENTS.md can be slimmed later):
  // 1) Group 1 fixed: domain, provider
  // 2) Group 2 fixed: owner, ip_version, ipv6_suffix
  // 3) Group 3: required by subset; sort by provider count desc, then first provider alpha asc
  // 4) Group 4: optional by subset; same sorting as Group 3
  // Group 3: required by at least one provider → sort by requiredCount desc, then first provider alpha asc
  const group3 = [];
  // Group 4: not required by any provider → sort by totalOptionalCount desc, then first provider alpha asc
  const group4 = [];

  for (const [jsonName, info] of registry.entries()) {
    const requiredCount = info.required.size;
    const optionalCount = info.optional.size;

    if (requiredCount > 0) {
      group3.push({ jsonName, count: requiredCount, firstProvider: firstProviderAlpha(info.required) });
    } else {
      group4.push({ jsonName, count: optionalCount, firstProvider: firstProviderAlpha(info.optional) });
    }
  }

  const sortGroup = (a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const firstProviderCompare = a.firstProvider.localeCompare(b.firstProvider);
    if (firstProviderCompare !== 0) return firstProviderCompare;
    return a.jsonName.localeCompare(b.jsonName);
  };

  group3.sort(sortGroup);
  group4.sort(sortGroup);

  return { group3, group4 };
}

/**
 * Returns the HA schema constraint string for a given settings field.
 */
function settingsConstraint(jsonName, isBool) {
  if (SETTINGS_FIELD_CONSTRAINTS[jsonName]) {
    return SETTINGS_FIELD_CONSTRAINTS[jsonName];
  }
  if (isBool) return "bool?";
  return "str?";
}

// ── Environment variable extraction ───────────────────────────────────────────

/**
 * Parses the upstream README.md env var table and returns env var keys in table order.
 */
function parseEnvVarsFromReadme(upstreamDir) {
  const path = join(upstreamDir, "README.md");
  const content = readFileSync(path, "utf8");

  const envVars = [];
  const headerMatch = content.match(/\|\s*Environment variable\s*\|[^\n]*/);
  if (!headerMatch) return envVars;

  const afterTable = content.slice(headerMatch.index);
  const headerColumns = headerMatch[0]
    .split("|")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const defaultColumn = headerColumns.indexOf("default");
  const descriptionColumn = headerColumns.indexOf("description");

  for (const line of afterTable.split("\n")) {
    if (!line.startsWith("|")) break;
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue;
    if (/^\|\s*Environment variable\s*\|/.test(line)) continue;

    const columns = line
      .split("|")
      .slice(1, -1)
      .map((part) => part.trim());

    const keyRaw = columns[0] ?? "";
    const keyMatch = keyRaw.match(/^`([A-Z][A-Z0-9_]+)`$/);
    if (!keyMatch) continue;

    const key = keyMatch[1];
    const defaultValue =
      defaultColumn >= 0 && defaultColumn < columns.length
        ? columns[defaultColumn].replace(/`/g, "").trim()
        : "";
    const description =
      descriptionColumn >= 0 && descriptionColumn < columns.length
        ? columns[descriptionColumn].trim()
        : columns[1]?.trim() ?? "";

    envVars.push({ key, defaultValue, description });
  }

  return envVars;
}

/**
 * Scans the upstream internal/config/*.go files for all env var keys consumed
 * via the gosettings reader (reader.String, reader.CSV, reader.Duration, reader.Get, etc.).
 *
 * Returns a Set<string> of env var names found in Go source.
 * Used to supplement the README list and catch vars that are in code but not documented.
 */
function parseEnvVarsFromGoConfig(upstreamDir) {
  const configDir = join(upstreamDir, "internal/config");
  const keys = new Set();
  let entries;
  try {
    entries = readdirSync(configDir);
  } catch {
    return keys;
  }
  for (const file of entries) {
    if (!file.endsWith(".go") || file.endsWith("_test.go")) continue;
    const content = readFileSync(join(configDir, file), "utf8");
    // Match reader.X("ENV_VAR_NAME") or reader.X("ENV_VAR_NAME", ...) patterns
    for (const m of content.matchAll(/\.\w+\(\s*"([A-Z][A-Z0-9_]+)"/g)) {
      keys.add(m[1]);
    }
    // Also match r.Get("KEY") style
    for (const m of content.matchAll(/r\.\w+\(\s*"([A-Z][A-Z0-9_]+)"/g)) {
      keys.add(m[1]);
    }
  }
  return keys;
}

/**
 * Returns the merged, deduplicated list of upstream env var keys.
 * README order is kept first; Go-only keys are appended at the end.
 *
 * Note: This combined list is used by generateEnvSchemaBlock to know which
 * keys to emit. computeEnvChanges uses the README keys to determine new additions
 * and the Go keys to guard against false removals.
 */
function getUpstreamEnvKeys(upstreamDir) {
  const readmeEnvVars = parseEnvVarsFromReadme(upstreamDir);
  const filteredReadmeEnvVars = readmeEnvVars.filter(
    (entry) => !EXCLUDED_ENV_CONSTRAINTS.has(entry.key),
  );
  const readmeKeys = filteredReadmeEnvVars.map((entry) => entry.key);
  const goKeys = parseEnvVarsFromGoConfig(upstreamDir);
  const filteredGoKeys = new Set(
    [...goKeys].filter((key) => !EXCLUDED_ENV_CONSTRAINTS.has(key)),
  );
  return { readmeEnvVars: filteredReadmeEnvVars, readmeKeys, goKeys: filteredGoKeys };
}

function parseProviderLabelsFromReadme(upstreamDir) {
  const path = join(upstreamDir, "README.md");
  const content = readFileSync(path, "utf8");
  const result = new Map();

  const start = content.indexOf("Check the documentation for your DNS provider:");
  if (start === -1) return result;
  const end = content.indexOf("\n\nNote that:", start);
  const section = end === -1 ? content.slice(start) : content.slice(start, end);

  for (const m of section.matchAll(/^-\s+\[([^\]]+)\]\(docs\/([^)]+)\)/gm)) {
    const label = m[1].trim();
    const stem = m[2].replace(/\.md$/, "").trim();
    const normalized = stem.replace(/[^a-z0-9.]/gi, "").toLowerCase();

    const candidates = new Set([
      toHaSlug(normalized),
      normalized.replace(/[.\-]/g, ""),
      normalized.replace(/[^a-z0-9]/g, ""),
    ]);
    if (normalized === "he.net") candidates.add("he");
    if (normalized === "ddnss.de") candidates.add("ddnss");

    for (const candidate of candidates) {
      if (candidate) result.set(candidate, label);
    }
  }

  return result;
}

// ── Current config.yaml parsing ───────────────────────────────────────────────

function parseConfigDocument(configText) {
  const doc = parseDocument(configText);
  if (doc.errors.length > 0) {
    const first = doc.errors[0];
    throw new Error(`Failed to parse ${CONFIG_PATH}: ${first.message}`);
  }
  return doc;
}

function parseYamlDocument(path, fileDescription) {
  const doc = parseDocument(readFileSync(path, "utf8"));
  if (doc.errors.length > 0) {
    const first = doc.errors[0];
    throw new Error(`Failed to parse ${fileDescription}: ${first.message}`);
  }
  return doc;
}

function parseCurrentEnvSchema(configDoc) {
  const envs = configDoc.getIn(["schema", "environments"], true);
  if (!envs || typeof envs.items === "undefined") {
    throw new Error("Could not find schema.environments in config.yaml");
  }

  const result = new Map();
  for (const item of envs.items) {
    const key = String(item?.key?.value ?? "").trim();
    const value = String(item?.value?.value ?? "").trim();
    if (key) result.set(key, value);
  }
  return result;
}

function parseCurrentSettingsSchema(configDoc) {
  const settingsSeq = configDoc.getIn(["schema", "settings"], true);
  if (!settingsSeq || typeof settingsSeq.items === "undefined") {
    throw new Error("Could not find schema.settings in config.yaml");
  }

  const firstSettingsMap = settingsSeq.items[0];
  if (!firstSettingsMap || typeof firstSettingsMap.items === "undefined") {
    throw new Error("Could not find schema.settings entry in config.yaml");
  }

  const result = new Map();
  for (const item of firstSettingsMap.items) {
    const key = String(item?.key?.value ?? "").trim();
    const value = String(item?.value?.value ?? "").trim();
    if (key) result.set(key, value);
  }
  return result;
}

function parseExistingTranslationFields(translationsDoc, section) {
  const fieldsNode = translationsDoc.getIn(["configuration", section, "fields"], true);
  if (!fieldsNode || typeof fieldsNode.items === "undefined") {
    throw new Error(`Could not find configuration.${section}.fields in ${EN_TRANSLATIONS_PATH}`);
  }

  const result = new Map();
  for (const item of fieldsNode.items) {
    const key = String(item?.key?.value ?? "").trim();
    const entry = item?.value?.toJSON?.() ?? {};
    if (!key) continue;
    result.set(key, {
      name: String(entry?.name ?? "").trim(),
      description: String(entry?.description ?? "").trim(),
    });
  }
  return result;
}

// ── Schema YAML generation ────────────────────────────────────────────────────

/**
 * Generates the new schema.environments YAML block (indented 4 spaces for keys).
 *
 * Strategy:
 *   1. Keep all existing env var keys where the key is in readmeKeys OR in goKeys
 *      (prevents false removals of undocumented-but-active keys like RESOLVER_TIMEOUT).
 *   2. Add new env vars from readmeKeys not already in current schema (str? default).
 *   3. Drop keys that are in neither README nor Go source (truly removed upstream).
 */
function generateEnvSchemaEntries(currentEnvs, readmeKeys, goKeys) {
  const entries = [];

  // Retain existing keys that are still present upstream (README or Go source)
  for (const [key, constraint] of currentEnvs.entries()) {
    if (readmeKeys.includes(key) || goKeys.has(key)) {
      entries.push([key, constraint]);
    }
  }

  // Append new keys from upstream README not yet in the schema
  for (const key of readmeKeys) {
    if (!currentEnvs.has(key)) {
      const constraint = ENV_CONSTRAINTS[key] ?? "str?";
      entries.push([key, constraint]);
    }
  }

  return entries;
}

/**
 * Generates the new schema.settings YAML block.
 *
 * Layout:
 *   - domain: str
 *     provider: list(...|...)?
 *     owner: str?
 *     ip_version: list(ipv4|ipv6|ipv4or6)?
 *     ipv6_suffix: match(...)?
 *     <group3 fields>
 *     <group4 fields>
 */
function generateSettingsSchemaEntries(providerSlugs, registry) {
  const { group3, group4 } = orderSettingsFields(registry);

  const providerList = `list(${providerSlugs.join("|")})`;
  const entries = [];

  // Group 1
  entries.push(["domain", SETTINGS_FIELD_CONSTRAINTS.domain]);
  entries.push(["provider", providerList]);

  // Group 2
  entries.push(["owner", SETTINGS_FIELD_CONSTRAINTS.owner]);
  entries.push(["ip_version", SETTINGS_FIELD_CONSTRAINTS.ip_version]);
  entries.push(["ipv6_suffix", SETTINGS_FIELD_CONSTRAINTS.ipv6_suffix]);

  // Group 3
  for (const { jsonName } of group3) {
    const isBool = registry.get(jsonName)?.isBool ?? false;
    entries.push([jsonName, settingsConstraint(jsonName, isBool)]);
  }

  // Group 4
  for (const { jsonName } of group4) {
    const isBool = registry.get(jsonName)?.isBool ?? false;
    entries.push([jsonName, settingsConstraint(jsonName, isBool)]);
  }

  return entries;
}

function generateStableSettingsEntries(currentSettings, providerSlugs, registry) {
  const generatedEntries = generateSettingsSchemaEntries(providerSlugs, registry);
  const generatedFields = new Set(generatedEntries.map(([key]) => key));
  const currentKeys = [...currentSettings.keys()];
  const currentFields = new Set(currentKeys);
  const currentProviderConstraint = currentSettings.get("provider") ?? "";
  const generatedProviderConstraint = `list(${providerSlugs.join("|")})`;

  const sameShape =
    generatedFields.size === currentFields.size &&
    [...generatedFields].every((key) => currentFields.has(key));

  const sameOrder =
    currentKeys.length === generatedEntries.length &&
    currentKeys.every((key, index) => key === generatedEntries[index][0]);

  if (sameShape && sameOrder && currentProviderConstraint === generatedProviderConstraint) {
    // Keep existing entry order to avoid no-op churn when the schema shape is unchanged.
    return currentKeys.map((key) => [key, currentSettings.get(key)]);
  }

  return generatedEntries;
}

// ── Translation generation ─────────────────────────────────────────────────────

function titleCaseFieldName(key) {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => {
      if (part.toUpperCase() === part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function normalizeSentence(text) {
  const trimmed = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function envDescriptionFromReadme(entry) {
  const sentence = normalizeSentence(entry?.description);
  const defaultValue = String(entry?.defaultValue ?? "").trim();
  if (!defaultValue) return sentence;
  if (/^(none|n\/a)$/i.test(defaultValue)) return sentence;
  return `${sentence} Default: ${defaultValue}.`.trim();
}

function formatProviderLabels(providerSet, providerLabels) {
  return [...providerSet]
    .map((slug) => providerLabels.get(slug) ?? titleCaseFieldName(slug))
    .sort((a, b) => a.localeCompare(b));
}

function settingsUsageSummary(field, registry, providerSlugs, providerLabels) {
  if (field === "domain" || field === "provider") {
    return "required: all providers";
  }
  if (field === "owner" || field === "ip_version" || field === "ipv6_suffix") {
    return "optional: all providers";
  }

  const info = registry.get(field);
  if (!info) return "optional: unknown";

  if (info.required.size === providerSlugs.length && providerSlugs.length > 0) {
    return "required: all providers";
  }
  if (info.optional.size === providerSlugs.length && providerSlugs.length > 0) {
    return "optional: all providers";
  }

  const parts = [];
  if (info.required.size > 0) {
    const requiredLabels = formatProviderLabels(info.required, providerLabels).join(", ");
    parts.push(`required: ${requiredLabels}`);
  }
  if (info.optional.size > 0) {
    const optionalLabels = formatProviderLabels(info.optional, providerLabels).join(", ");
    parts.push(`optional: ${optionalLabels}`);
  }
  return parts.join("; ");
}

function generateEnvironmentTranslationEntries(
  envSchemaEntries,
  readmeEnvVars,
  existingFields,
  newlyAddedKeys,
) {
  const metadataByKey = new Map(readmeEnvVars.map((entry) => [entry.key, entry]));
  const newlyAdded = new Set(newlyAddedKeys);
  const entries = [];

  for (const [key] of envSchemaEntries) {
    const existing = existingFields.get(key);
    if (existing) {
      entries.push([key, existing]);
      continue;
    }

    if (!newlyAdded.has(key)) continue;

    const metadata = metadataByKey.get(key);
    const description = envDescriptionFromReadme(metadata) || `${key} environment variable.`;
    entries.push([
      key,
      {
        name: key,
        description,
      },
    ]);
  }

  return entries;
}

function generateSettingsTranslationEntries(
  settingsSchemaEntries,
  registry,
  providerSlugs,
  providerLabels,
  existingFields,
  newlyAddedKeys,
) {
  const newlyAdded = new Set(newlyAddedKeys);
  const entries = [];
  for (const [key] of settingsSchemaEntries) {
    const existing = existingFields.get(key);
    if (existing) {
      entries.push([key, existing]);
      continue;
    }

    if (!newlyAdded.has(key)) continue;

    const title = titleCaseFieldName(key);
    const usage = settingsUsageSummary(key, registry, providerSlugs, providerLabels);
    entries.push([
      key,
      {
        name: title,
        description: `${title} setting (${usage}).`,
      },
    ]);
  }
  return entries;
}

// ── Change detection ──────────────────────────────────────────────────────────

function computeEnvChanges(currentEnvs, readmeKeys, goKeys) {
  const readmeSet = new Set(readmeKeys);
  const added = [];
  const removed = [];

  // New: in README but not in current schema
  for (const key of readmeKeys) {
    if (!currentEnvs.has(key)) {
      added.push(key);
    }
  }

  // Removed: in current schema but NOT in README AND NOT in Go source
  // (Go-source check prevents false removals for undocumented-but-active keys)
  for (const key of currentEnvs.keys()) {
    if (!readmeSet.has(key) && !goKeys.has(key)) {
      removed.push(key);
    }
  }

  return { added, removed, changed: [] };
}

function computeSettingsChanges(currentSettings, expectedSettingsEntries) {
  const expectedFieldOrder = expectedSettingsEntries.map(([field]) => field);
  const allGroupFields = new Set(expectedFieldOrder);
  const expectedConstraints = new Map(expectedSettingsEntries);

  const added = [];
  const removed = [];

  for (const jsonName of allGroupFields) {
    if (!currentSettings.has(jsonName)) {
      added.push(jsonName);
    }
  }

  for (const jsonName of currentSettings.keys()) {
    if (!allGroupFields.has(jsonName)) {
      removed.push(jsonName);
    }
  }

  const changed = [];

  // Constraint changes for existing fields (includes provider list changes).
  for (const [field, nextConstraint] of expectedConstraints.entries()) {
    if (!currentSettings.has(field)) continue;
    const currentConstraint = currentSettings.get(field) ?? "";
    if (currentConstraint !== nextConstraint) {
      changed.push({ field, from: currentConstraint, to: nextConstraint });
    }
  }

  // Order changes inside the tracked settings set.
  const currentOrder = [...currentSettings.keys()].filter((field) => allGroupFields.has(field));
  const hasSameOrder =
    currentOrder.length === expectedFieldOrder.length &&
    currentOrder.every((field, index) => field === expectedFieldOrder[index]);
  if (!hasSameOrder) {
    changed.push({
      field: "_order",
      from: currentOrder.join(","),
      to: expectedFieldOrder.join(","),
    });
  }

  return { added, removed, changed };
}

function computeTranslationChanges(currentFields, nextEntries) {
  const nextMap = new Map(nextEntries);
  const added = [];
  const removed = [];
  const changed = [];

  for (const key of nextMap.keys()) {
    if (!currentFields.has(key)) added.push(key);
  }
  for (const key of currentFields.keys()) {
    if (!nextMap.has(key)) removed.push(key);
  }
  for (const [key, nextValue] of nextMap.entries()) {
    const currentValue = currentFields.get(key);
    if (!currentValue) continue;
    if (
      currentValue.name !== nextValue.name ||
      currentValue.description !== nextValue.description
    ) {
      changed.push(key);
    }
  }

  return { added, removed, changed };
}

// ── Config YAML mutation ──────────────────────────────────────────────────────

/**
 * Mutates schema.environments and schema.settings in the YAML document.
 * The top-level key order is preserved by mutating nested nodes only.
 */
function applySchemaChanges(configDoc, envEntries, settingsEntries) {
  const schema = configDoc.get("schema", true);
  if (!schema) {
    throw new Error("Could not find schema in config.yaml");
  }

  const nextEnvObject = Object.fromEntries(envEntries);
  const nextSettingsObject = Object.fromEntries(settingsEntries);

  configDoc.setIn(["schema", "environments"], nextEnvObject);
  configDoc.setIn(["schema", "settings"], [nextSettingsObject]);
}

function applyTranslationChanges(translationsDoc, environmentEntries, settingsEntries) {
  translationsDoc.setIn(
    ["configuration", "environments", "fields"],
    Object.fromEntries(environmentEntries),
  );
  translationsDoc.setIn(["configuration", "settings", "fields"], Object.fromEntries(settingsEntries));
}

// ── GITHUB_OUTPUT writer ──────────────────────────────────────────────────────

function writeOutputs(outputs) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  for (const [key, value] of Object.entries(outputs)) {
    appendFileSync(outputPath, `${key}=${value}\n`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const upstreamDirIdx = args.indexOf("--upstream-dir");
  const isDryRun = args.includes("--dry-run");
  const isWrite = args.includes("--write");

  if (upstreamDirIdx === -1 || !args[upstreamDirIdx + 1]) {
    throw new Error(
      "Usage: node upstream-bump-sync-config.mjs --upstream-dir <path> [--dry-run | --write]",
    );
  }
  if (!isDryRun && !isWrite) {
    throw new Error("Either --dry-run or --write is required");
  }

  const upstreamDir = args[upstreamDirIdx + 1];

  // 1. Parse upstream
  console.log("Parsing upstream provider slugs…");
  const providerSlugs = parseProviderSlugs(upstreamDir);

  console.log(`Found ${providerSlugs.length} provider(s)`);

  console.log("Parsing provider settings fields…");
  const registry = buildFieldRegistry(upstreamDir, providerSlugs);
  applyRequiredFieldOverrides(registry, providerSlugs);
  applyOptionalFieldOverrides(registry, providerSlugs);

  console.log(`Found ${registry.size} unique settings field(s) across all providers`);

  console.log("Parsing upstream environment variables (README + Go config source)…");
  const { readmeEnvVars, readmeKeys, goKeys } = getUpstreamEnvKeys(upstreamDir);
  const providerLabels = parseProviderLabelsFromReadme(upstreamDir);

  console.log(
    `Found ${readmeKeys.length} README env variable(s); ` +
    `${goKeys.size} Go-source env variable(s)`,
  );

  // 2. Read current config
  const configDoc = parseConfigDocument(readFileSync(CONFIG_PATH, "utf8"));
  const translationsDoc = parseYamlDocument(EN_TRANSLATIONS_PATH, EN_TRANSLATIONS_PATH);
  const currentEnvs = parseCurrentEnvSchema(configDoc);
  const currentSettings = parseCurrentSettingsSchema(configDoc);
  const currentEnvTranslations = parseExistingTranslationFields(translationsDoc, "environments");
  const currentSettingsTranslations = parseExistingTranslationFields(translationsDoc, "settings");

  const newEnvEntries = generateEnvSchemaEntries(currentEnvs, readmeKeys, goKeys);
  const canonicalSettingsEntries = generateSettingsSchemaEntries(providerSlugs, registry);
  const newSettingsEntries = generateStableSettingsEntries(currentSettings, providerSlugs, registry);

  // 3. Compute changes
  const envChanges = computeEnvChanges(currentEnvs, readmeKeys, goKeys);
  const settingsChanges = computeSettingsChanges(currentSettings, canonicalSettingsEntries);

  const newEnvTranslationEntries = generateEnvironmentTranslationEntries(
    newEnvEntries,
    readmeEnvVars,
    currentEnvTranslations,
    envChanges.added,
  );
  const newSettingsTranslationEntries = generateSettingsTranslationEntries(
    newSettingsEntries,
    registry,
    providerSlugs,
    providerLabels,
    currentSettingsTranslations,
    settingsChanges.added,
  );
  const envTranslationChanges = computeTranslationChanges(
    currentEnvTranslations,
    newEnvTranslationEntries,
  );
  const settingsTranslationChanges = computeTranslationChanges(
    currentSettingsTranslations,
    newSettingsTranslationEntries,
  );

  const changeReport = {
    environments: {
      added: envChanges.added,
      removed: envChanges.removed,
      changed: envChanges.changed,
    },
    settings: {
      added: settingsChanges.added,
      removed: settingsChanges.removed,
      changed: settingsChanges.changed,
    },
    translations: {
      environments: {
        added: envTranslationChanges.added,
        removed: envTranslationChanges.removed,
        changed: envTranslationChanges.changed,
      },
      settings: {
        added: settingsTranslationChanges.added,
        removed: settingsTranslationChanges.removed,
        changed: settingsTranslationChanges.changed,
      },
    },
  };

  const totalChanges =
    envChanges.added.length +
    envChanges.removed.length +
    envChanges.changed.length +
    settingsChanges.added.length +
    settingsChanges.removed.length +
    settingsChanges.changed.length +
    envTranslationChanges.added.length +
    envTranslationChanges.removed.length +
    envTranslationChanges.changed.length +
    settingsTranslationChanges.added.length +
    settingsTranslationChanges.removed.length +
    settingsTranslationChanges.changed.length;

  const configChanged = totalChanges > 0;
  const hasBreakingChange =
    envChanges.removed.length > 0 || settingsChanges.removed.length > 0;

  // 4. Print change report
  console.log("\n── Change report ──────────────────────────────────────────────");
  console.log(JSON.stringify(changeReport, null, 2));
  console.log(`\nconfig_changed: ${configChanged}`);
  console.log(`has_breaking_change: ${hasBreakingChange}`);

  // 5. Apply/write in write mode (always rewrite files in --write mode)
  if (isWrite) {
    applySchemaChanges(configDoc, newEnvEntries, newSettingsEntries);
    applyTranslationChanges(translationsDoc, newEnvTranslationEntries, newSettingsTranslationEntries);
    writeFileSync(CONFIG_PATH, configDoc.toString(), "utf8");
    writeFileSync(EN_TRANSLATIONS_PATH, translationsDoc.toString(), "utf8");
    if (!configChanged) {
      console.log("\nNo semantic changes detected; files rewritten in --write mode.");
    }
    console.log(`\nWritten: ${CONFIG_PATH}`);
    console.log(`Written: ${EN_TRANSLATIONS_PATH}`);
  }

  // 6. Write GITHUB_OUTPUT
  writeOutputs({
    config_changed: String(configChanged),
    has_breaking_change: String(hasBreakingChange),
    change_report: encodeURIComponent(JSON.stringify(changeReport)),
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
