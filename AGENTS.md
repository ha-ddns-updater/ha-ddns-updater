# Maintainer Guide: ha-ddns-updater

This guide covers addon versioning, development setup, and the ruleset for maintaining schema constraints in `ddns-updater/config.yaml`.

## Addon Versioning Schema

This addon uses semantic versioning with upstream tracking:

**Format:** `<upstream>-ha<addon>`

**Components:**
- `<upstream>`: Version of `qdm12/ddns-updater` (e.g., `2.9.0`)
- `-ha`: Home Assistant addon marker
- `<addon>`: Semantic version of the addon itself (e.g., `1.6.1`)
  - **Major**: Breaking changes to addon UX or schema constraints
  - **Minor**: New features or non-breaking schema additions
  - **Patch**: Bug fixes, constraint refinements, documentation updates

**Example:** `2.9.0-ha1.6.1`
- Uses upstream version `2.9.0`
- Addon version `1.6.1` (patch bump for schema refinement or fix)

When upstream bumps to `v2.10.0`, the next addon release resets addon patch: `2.10.0-ha1.0.0`.

> **Agent policy:** Agents must never bump addon versions manually. Version bumps are handled by CI.

## Development Setup

The `qdm12/ddns-updater` directory is a **local reference for maintainer work only**—it is not part of the published addon and is intentionally excluded from git via `.git/info/exclude`.

### Prerequisites

**On a fresh clone of this addon repository:**
- The `qdm12/` directory does not exist (not tracked in git)
- You must check it out manually to work with schema validation and provider updates

### Checkout Upstream Reference

1. **Identify the upstream version** from `ddns-updater/config.yaml`:
   ```bash
   grep "^version:" ddns-updater/config.yaml | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\).*/\1/'
   ```
   This extracts the upstream version (e.g., `2.9.0` from `2.9.0-ha1.6.1`).

2. **Clone the upstream repository** at the matching tag (detached HEAD):
   ```bash
   UPSTREAM_VERSION=$(grep "^version:" ddns-updater/config.yaml | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\).*/\1/')
   git clone --depth 1 --branch "v${UPSTREAM_VERSION}" https://github.com/qdm12/ddns-updater.git qdm12/ddns-updater
   ```

3. **Verify git exclusion:**
   ```bash
   grep "^qdm12/" .git/info/exclude
   ```
   If missing, add it:
   ```bash
   echo "qdm12/" >> .git/info/exclude
   ```

---

## Agent Ruleset: Schema Constraint Sync

This ruleset defines how to maintain `ddns-updater/config.yaml` schema constraints when upstream `qdm12/ddns-updater` changes providers or environment variables.

### Scope

- Target file: `ddns-updater/config.yaml`
- Sections: `schema.environments` and `schema.settings`
- Constraint types used:
  - `match(REGEX)` for strings
  - `int(min,max)` for integers

### Sources of truth (in priority order)

1. Upstream runtime validation in Go code under:
   - `qdm12/ddns-updater/internal/config/`
   - `qdm12/ddns-updater/internal/provider/providers/*/provider.go`
   - `qdm12/ddns-updater/internal/provider/utils/`
2. Upstream provider/env documentation:
   - `qdm12/ddns-updater/README.md`
   - `qdm12/ddns-updater/docs/*.md`
3. Addon UX policy (usability improvements when safe):
   - add non-breaking format constraints for broad, shared fields

### Safety policy

- Apply strict constraints globally only when they are valid for all providers using that field.
- Do **not** enforce provider-specific formats globally on shared keys (for example `token`, `key`, `email`).
- Prefer broad-but-helpful regexes over brittle exact regexes unless upstream has one universal format.

### Applied ruleset (current)

#### `schema.environments`

- `UMASK: match(^[0-7]{3,4}$)?`
  - Usability rule for octal umask (`0022`, `022`, etc.).

- `TZ: match(^$|^([A-Za-z_]+(?:/[A-Za-z0-9_+\-]+)+|UTC)$)?`
  - Usability rule for common IANA timezone paths and `UTC`.

- `PUBLICIP_FETCHERS: match(^\s*(all|http|dns)\s*(,\s*(all|http|dns)\s*)*$)?`
  - Based on upstream parser for allowed fetcher tokens.

- `PUBLICIP_HTTP_PROVIDERS: match(^\s*(all|ipify|ifconfig|ipinfo|spdyn|ipleak|icanhazip|ident|nnev|wtfismyip|seeip|changeip|url:https://[^,\s]+)\s*(,\s*(all|ipify|ifconfig|ipinfo|spdyn|ipleak|icanhazip|ident|nnev|wtfismyip|seeip|changeip|url:https://[^,\s]+)\s*)*$)?`

- `PUBLICIPV4_HTTP_PROVIDERS: match(^\s*(all|ipleak|ipify|icanhazip|ident|nnev|wtfismyip|seeip|url:https://[^,\s]+)\s*(,\s*(all|ipleak|ipify|icanhazip|ident|nnev|wtfismyip|seeip|url:https://[^,\s]+)\s*)*$)?`

- `PUBLICIPV6_HTTP_PROVIDERS: match(^\s*(all|ipleak|ipify|icanhazip|ident|nnev|wtfismyip|seeip|url:https://[^,\s]+)\s*(,\s*(all|ipleak|ipify|icanhazip|ident|nnev|wtfismyip|seeip|url:https://[^,\s]+)\s*)*$)?`
  - Provider lists derived from upstream README and config validators.
  - Supports custom HTTPS URLs via `url:https://...`.

- `PUBLICIP_DNS_PROVIDERS: match(^\s*(all|cloudflare|opendns)\s*(,\s*(all|cloudflare|opendns)\s*)*$)?`
  - Provider list from upstream README/validator.

- `RESOLVER_ADDRESS: match(^$|^[^:\s]+:\d{1,5}$|^\[[0-9A-Fa-f:]+\]:\d{1,5}$)?`
  - Matches upstream host:port expectation, including bracketed IPv6.

#### `schema.settings`

- `ipv6_suffix: match(^[0-9A-Fa-f:]+/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$)?`
  - Usability rule for IPv6 CIDR-like value (`addr/prefix`).

- `url: match(^https://.+$)?`
  - Mirrors custom provider HTTPS requirement.

- `mode: match(^(api|dyndns)$)?`
  - Mirrors OVH mode choices.

- `ttl: int(1,4294967295)?`
  - Safe global bound for positive `uint32` TTL semantics.
  - Provider-specific tighter ranges (for example NameSilo) are intentionally not globalized.

- `user_service_key: match(^v1\.0.+$)?`
  - Mirrors Cloudflare user service key format.

### Intentionally unconstrained shared fields

Keep as `str?` due provider-specific formats or conditional requirements:

- `token`, `key`, `email`, `password`, `username`, `zone_identifier`, `api_endpoint`, `access_key`, `secret_key`, `secret`, etc.

### Settings field ordering rule

When upstream adds or changes provider fields in `schema.settings`, apply this ordering:

1. **Group 1: Fields required by all providers** (fixed order)
   - `domain` — listed first because the Home Assistant configuration UI uses the first field as the display label for each settings entry, making the domain the primary identifier visible to the user
   - `provider`

2. **Group 2: Fields optional for all providers** (fixed order)
   - `owner`
   - `ip_version`
   - `ipv6_suffix`

3. **Group 3: Fields required by a subset of providers** (sorted by)
   - Primary: number of providers using the field (descending)
   - Secondary: alphabetical order of first provider label in that field's provider list (ascending)

4. **Group 4: Fields optional for a subset of providers** (same sorting as Group 3)

#### Example from current version

Current Group 3 ordering by provider count (desc):
- `password` (20 providers)
- `username` (18 providers)
- `token` (12 providers)
- `key` (6 providers)
- `api_key` (3 providers)
- `secret` (2 providers: Domeneshop, GoDaddy)
- `email` (2 providers: LuaDNS, Variomedia.de)
- Tied at 1, sorted by first provider alphabetical:
  - `access_key_id` (Aliyun)
  - `access_secret` (Aliyun)
  - `region` (Aliyun)
  - `ipv4key` (Custom)
  - `ipv6key` (Custom)
  - `success_regex` (Custom)
  - `url` (Custom)
  - `client_key` (DynDNS)
  - `personal_access_token` (Gandi)
  - `credentials` (GCP)
  - `project` (GCP)
  - `zone` (GCP)
  - `customer_number` (Netcup)
  - `api_endpoint` (OVH)
  - `app_key` (OVH)
  - `app_secret` (OVH)
  - `consumer_key` (OVH)
  - `mode` (OVH)
  - `secret_api_key` (Porkbun)
  - `access_key` (Route53)
  - `secret_key` (Route53)
  - `zone_id` (Route53)
  - `apikey` (Vultr)

Current Group 4 ordering by provider count (desc):
- `ttl` (9 providers)
- `zone_identifier` (2 providers: Cloudflare, Hetzner)
- `proxied` (1 provider: Cloudflare)
- `user_service_key` (1 provider: Cloudflare)
- `dual_stack` (1 provider: DDNSS.de)
- `group` (1 provider: Dynu)
- `user` (1 provider: Spdyn)

### Reapply workflow after upstream updates

1. Diff upstream env vars in `qdm12/ddns-updater/README.md` against `schema.environments`.
2. Diff provider field usage in `qdm12/ddns-updater/internal/provider/providers/*/provider.go`.
3. For each new/changed field, classify as:
   - universal strict constraint,
   - provider-specific only,
   - usability-only (safe broad pattern).
4. Update `ddns-updater/config.yaml` schema accordingly.
5. Validate YAML parsing.
6. Keep this file (`AGENTS.md`) updated with any new regex/range rules.

### Workflow Checklist

Before updating schema constraints, verify:

- [ ] Upstream version identified from `ddns-updater/config.yaml` version field
- [ ] `qdm12/ddns-updater` checked out at matching **git tag** (detached HEAD):
  ```bash
  cd qdm12/ddns-updater && git describe --tags
  ```
- [ ] Diffs performed against upstream:
  - [ ] Env vars in `README.md` vs `schema.environments`
  - [ ] Provider fields in `internal/provider/providers/*/provider.go` vs `schema.settings`
- [ ] Schema constraints applied per [Safety policy](#safety-policy) and [Applied ruleset](#applied-ruleset-current)
- [ ] Field ordering follows [Settings field ordering rule](#settings-field-ordering-rule)
- [ ] YAML validation passed:
  ```bash
  python -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('ddns-updater/config.yaml').read_text()); print('config.yaml OK')"
  ```
- [ ] `AGENTS.md` updated with any new constraint rules
- [ ] Addon version bumped (see [Addon Versioning Schema](#addon-versioning-schema))

### Validation command

```bash
python -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('ddns-updater/config.yaml').read_text()); print('config.yaml OK')"
```
