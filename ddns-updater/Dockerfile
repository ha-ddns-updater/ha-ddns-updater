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
FROM docker.io/qmcgaw/ddns-updater:latest

# Copy the Go entrypoint binary
COPY --from=builder /build/entrypoint /entrypoint

# Override the entrypoint to run our config transformer first
ENTRYPOINT ["/entrypoint"]
