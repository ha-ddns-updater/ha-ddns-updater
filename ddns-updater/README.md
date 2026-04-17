# Home Assistant DDNS Updater Addon

A Home Assistant addon that wraps [qdm12/ddns-updater](https://github.com/qdm12/ddns-updater) for automatic DNS record updates across multiple DNS providers.

## Configuration

Configuration is done via the Home Assistant UI. The addon expects settings in the `settings` array, matching [qdm12/ddns-updater's configuration format](https://github.com/qdm12/ddns-updater#configuration).

### Example Configuration

```yaml
period: "5m"
server_enabled: true
log_level: "info"
settings:
  - provider: "duckdns"
    domain: "example.duckdns.org"
    token: "00000000-0000-0000-0000-000000000000"
  - provider: "cloudflare"
    domain: "example.com"
    owner: "subdomain"
    email: "user@example.com"
    key: "your-api-key"
```

### Configuration Options

- **period**: Time between update checks (default: `5m`)
    - Examples: `30s`, `5m`, `1h`

- **server_enabled**: Enable the HTTP web UI on port 8000 (default: `true`)

- **log_level**: Logging level (default: `info`)
    - Options: `debug`, `info`, `warn`, `error`

- **settings**: Array of DNS provider configurations
    - Each entry is a provider-specific object
    - Required field: `provider` (provider name)
    - Required field: `domain` (domain or subdomain to update)
    - Provider-specific fields (e.g., `token`, `key`, `secret`, `email`, etc.)

## Upstream Project

This addon is built on top of [qdm12/ddns-updater](https://github.com/qdm12/ddns-updater). For detailed information about configuration options for each provider, refer to their [documentation](https://github.com/qdm12/ddns-updater/blob/master/README.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

The upstream project [qdm12/ddns-updater](https://github.com/qdm12/ddns-updater) is also licensed under the MIT License - see their [LICENSE](https://github.com/qdm12/ddns-updater/blob/master/LICENSE) file.

## Support

For issues or questions:
- Check [qdm12/ddns-updater documentation](https://github.com/qdm12/ddns-updater)
- Open an issue on [GitLab](https://gitlab.com/ha-ddns-updater/ha-ddns-updater)

## Build

```bash
TAG=0.0.0
buildah manifest create ha-ddns-updater:$TAG
# upstream has linux/386,linux/amd64,linux/arm/v6,linux/arm/v7,linux/arm64,linux/ppc64le,linux/riscv64,linux/s390x but HA only supports linux/amd64, linux/arm64 and linux/arm/v7 so we only build those
buildah bud --jobs=4 --platform=linux/amd64,linux/arm/v7,linux/arm64 --manifest ha-ddns-updater:$TAG --layers --format docker -f Dockerfile -t docker.io/haddnsupdater/ha-ddns-updater:$TAG .
buildah manifest push --all ha-ddns-updater:$TAG docker://docker.io/haddnsupdater/ha-ddns-updater:$TAG
```
