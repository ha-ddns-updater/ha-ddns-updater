# Configuration

Configuration is done via the Home Assistant UI. The addon expects settings in the `settings` array, matching [qdm12/ddns-updater's configuration format](https://github.com/qdm12/ddns-updater#configuration).

## Example Configuration

```yaml
environments:
  PERIOD: "5m"
  SERVER_ENABLED: "yes"
  LOG_LEVEL: "info"
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

## Configuration Options

- **environments**: Map of environment variables passed directly to `ddns-updater`
    - Examples: `PERIOD`, `SERVER_ENABLED`, `LOG_LEVEL`, `HTTP_TIMEOUT`, `TZ`
    - Setting `LOG_LEVEL` to `debug` also enables addon entrypoint diagnostics, including a listing of the options file directory and a raw dump of `options.json` before launching `ddns-updater` which might expose secrets in the logs, so use with caution.

- **settings**: Array of DNS provider configurations
    - Each entry is a provider-specific object
    - Required field: `provider` (provider name)
    - Required field: `domain` (domain or subdomain to update)
    - Provider-specific fields (e.g., `token`, `key`, `secret`, `email`, etc.)
