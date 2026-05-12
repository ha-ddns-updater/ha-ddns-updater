# Maintainer Guide: ha-ddns-updater

This guide covers addon versioning, development setup, and high-level maintenance policy for schema/translation sync.

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

The `qdm12/ddns-updater` directory is a **local reference for maintainer work only**. It is not part of the published addon and should remain excluded from git.

### Prerequisites

On a fresh clone of this addon repository:
- The `qdm12/` directory may not exist (not tracked in git)
- You need to check it out manually for upstream schema/provider sync work

### Checkout Upstream Reference

1. Identify the upstream version from `ddns-updater/config.yaml`:

```bash
grep "^version:" ddns-updater/config.yaml | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\).*/\1/'
```

2. Clone upstream at the matching tag (detached HEAD):

```bash
UPSTREAM_VERSION=$(grep "^version:" ddns-updater/config.yaml | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\).*/\1/')
git clone --depth 1 --branch "v${UPSTREAM_VERSION}" https://github.com/qdm12/ddns-updater.git qdm12/ddns-updater
```

3. Ensure local upstream reference is excluded from git:

```bash
grep "^qdm12/" .git/info/exclude || echo "qdm12/" >> .git/info/exclude
```

## Schema/Translation Sync Policy

### Scope

- Target files:
  - `ddns-updater/config.yaml`
  - `ddns-updater/translations/en.yaml`
- Managed areas:
  - `schema.environments`
  - `schema.settings`
  - translation field ordering and descriptions for synced keys

### Sources of Truth (priority order)

1. Upstream runtime validation in Go code under:
   - `qdm12/ddns-updater/internal/config/`
   - `qdm12/ddns-updater/internal/provider/providers/*/provider.go`
   - `qdm12/ddns-updater/internal/provider/utils/`
2. Upstream provider/env documentation:
   - `qdm12/ddns-updater/README.md`
   - `qdm12/ddns-updater/docs/*.md`
3. Addon UX policy:
   - non-breaking constraints and predictable ordering where safe

### Safety Policy

- Apply strict constraints globally only when valid for all providers using that field.
- Do **not** enforce provider-specific formats globally on shared keys (for example `token`, `key`, `email`).
- Prefer broad-but-helpful constraints over brittle exact patterns unless upstream has universal validation.
- Keep wrapper-managed runtime env vars out of addon user schema constraints.

## Authoritative Implementation

Constraint assignment, ordering, required/optional classification overrides, and translation sync behavior are implemented in:

- `.github/scripts/upstream-bump-sync-config.mjs`

Behavioral and regression coverage is in:

- `.github/scripts/upstream-bump-sync-config.test.mjs`

When changing sync behavior, update script + tests first, then keep this guide aligned at policy level only.

## Brand Asset Sync

`ddns-updater/icon.png` and `ddns-updater/logo.png` can be updated by executing the "Generate Brand Assets" workflow.
