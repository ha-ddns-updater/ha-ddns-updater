ARG GO_VERSION=1.25
ARG ALPINE_VERSION=3.23

# Build stage for the entrypoint binary
FROM docker.io/golang:${GO_VERSION}-alpine${ALPINE_VERSION} AS builder
WORKDIR /build
ENV CGO_ENABLED=0

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ ./cmd/
COPY internal/ ./internal/

RUN go build -trimpath -ldflags="-s -w" -o entrypoint cmd/entrypoint/main.go

# Final stage: extend the qdm12 image
FROM docker.io/qmcgaw/ddns-updater:2.10.0

ARG VERSION=unknown
ARG CREATED="an unknown date"
ARG COMMIT=unknown
ARG BUILD_ARCH=unknown

LABEL \
	io.hass.type="addon" \
	io.hass.version="${VERSION}" \
	io.hass.arch="${BUILD_ARCH}" \
	io.hass.name="DDNS Updater" \
	io.hass.description="Universal DNS updater with support for multiple DNS providers utilizing ddns-updater." \
	org.opencontainers.image.authors="Quentin McGaw <quentin.mcgaw@gmail.com>, Matthias Blümel <blaimi@blaimi.de>" \
	org.opencontainers.image.version="${VERSION}" \
	org.opencontainers.image.created="${CREATED}" \
	org.opencontainers.image.revision="${COMMIT}" \
	org.opencontainers.image.url="https://github.com/ha-ddns-updater/ha-ddns-updater" \
	org.opencontainers.image.documentation="https://github.com/ha-ddns-updater/ha-ddns-updater/blob/main/ddns-updater/README.md" \
	org.opencontainers.image.source="https://github.com/ha-ddns-updater/ha-ddns-updater" \
	org.opencontainers.image.title="ha-ddns-updater" \
	org.opencontainers.image.description="Home Assistant add-on wrapper for qdm12/ddns-updater"

# Copy the Go entrypoint binary
COPY --from=builder /build/entrypoint /entrypoint

USER 0:0

# Override the entrypoint to run our config transformer first
ENTRYPOINT ["/entrypoint"]
