# Home Assistant DDNS Updater Addon

A Home Assistant addon that wraps [qdm12/ddns-updater](https://github.com/qdm12/ddns-updater) for automatic DNS record updates across multiple DNS providers.

## Installation

[![Open your Home Assistant instance and show the add app repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fha-ddns-updater%2Fha-ddns-updater)

### manually
1. Add this repository to Home Assistant:
   - Settings → Add-ons → Create add-on repository
   - URL: `https://github.com/ha-ddns-updater/ha-ddns-updater`

2. Install the addon:
   - Settings → Add-ons → DDNS Updater

3. Configure your DNS providers

## Releases

Releases are automated with `semantic-release` on pushes to `main`.

- Git tags use the add-on semver only (for example `1.0.5`), without a `v` prefix.
- `ddns-updater/config.yaml` keeps the full runtime version schema `UPSTREAM-haADDON` (for example `2.9.0-ha1.0.5`).
- The upstream part is preserved by release automation and only changed by the upstream bump workflow.
- Upstream bump PRs use `feat:` commits so merging them triggers a minor add-on bump.
- Release notes are written to `ddns-updater/CHANGELOG.md` by semantic-release.

## Sponsor

[![Buy me a coffee](https://cdn.buymeacoffee.com/buttons/default-yellow.png)](https://www.buymeacoffee.com/blaimi)
