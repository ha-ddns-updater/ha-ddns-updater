ARG GO_VERSION=1.25
ARG ALPINE_VERSION=3.23

# Build stage for the entrypoint binary
FROM docker.io/golang:${GO_VERSION}-alpine${ALPINE_VERSION} AS builder
WORKDIR /build
ENV CGO_ENABLED=0

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ ./cmd/

RUN go build -trimpath -ldflags="-s -w" -o entrypoint cmd/entrypoint/main.go

# Final stage: extend the qdm12 image
FROM docker.io/qmcgaw/ddns-updater:2.9.0

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=5 CMD ["/updater/ddns-updater", "healthcheck"]

# Copy the Go entrypoint binary
COPY --from=builder /build/entrypoint /entrypoint

USER 0:0

# Override the entrypoint to run our config transformer first
ENTRYPOINT ["/entrypoint"]
