# Build stage - everything in one stage for maximum GitHub Actions caching
FROM debian:12-slim AS builder

# Install base dependencies including tini for better caching
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    curl \
    bash \
    tar \
    xz-utils \
    ca-certificates \
    tini \
    unzip \
    && rm -rf /var/lib/apt/lists/* \
    && /usr/bin/tini --version

# Create app directory
WORKDIR /app

# Copy .tool-versions to get versions
COPY .tool-versions ./

# Install Node.js, Bun and pnpm based on .tool-versions
RUN NODE_VERSION=$(cat .tool-versions | grep 'nodejs' | cut -d ' ' -f 2) && \
    PNPM_VERSION=$(cat .tool-versions | grep 'pnpm' | cut -d ' ' -f 2) && \
    ARCH=$(uname -m) && \
    echo "Installing Node.js v${NODE_VERSION}, Bun and pnpm v${PNPM_VERSION} for ${ARCH}" && \
    \
    # Map architecture names for Node.js and Bun official builds
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        NODE_ARCH="arm64"; \
        BUN_ARCH="aarch64"; \
        PNPM_ARCH="arm64"; \
    elif [ "$ARCH" = "x86_64" ]; then \
        NODE_ARCH="x64"; \
        BUN_ARCH="x64"; \
        PNPM_ARCH="x64"; \
    else \
        echo "Unsupported architecture: ${ARCH}" && exit 1; \
    fi && \
    \
    # Download and install official Node.js glibc build
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o node-official.tar.xz && \
    tar -xJf node-official.tar.xz --strip-components=1 -C /usr/local && \
    rm node-official.tar.xz && \
    \
    # Download and install Bun
    curl -fsSL "https://github.com/oven-sh/bun/releases/latest/download/bun-linux-${BUN_ARCH}.zip" -o bun.zip && \
    unzip bun.zip && \
    mv bun-linux-${BUN_ARCH}/bun /usr/local/bin/bun && \
    chmod +x /usr/local/bin/bun && \
    rm -rf bun.zip bun-linux-${BUN_ARCH} && \
    \
    # Install pnpm
    curl -fsSL "https://github.com/pnpm/pnpm/releases/download/v${PNPM_VERSION}/pnpm-linuxstatic-${PNPM_ARCH}" -o /usr/local/bin/pnpm && \
    chmod +x /usr/local/bin/pnpm && \
    \
    # Verify installations
    echo "Final versions installed:" && \
    node -v && \
    bun -v && \
    pnpm -v && \
    \
    # verify that node -v matches .tool-versions nodejs version
    if [ "$(node -v)" != "v${NODE_VERSION}" ]; then \
        echo "Node.js version mismatch"; \
        exit 1; \
    fi && \
    # verify that pnpm -v matches .tool-versions pnpm version
    if [ "$(pnpm -v)" != "${PNPM_VERSION}" ]; then \
        echo "pnpm version mismatch"; \
        exit 1; \
    fi

# verify that pnpm store path
RUN STORE_PATH="/root/.local/share/pnpm/store" && \
    if [ "${STORE_PATH#/root/.local/share/pnpm/store}" = "${STORE_PATH}" ]; then \
        echo "pnpm store path mismatch: ${STORE_PATH}"; \
        exit 1; \
    fi && \
    echo "pnpm store path matches: ${STORE_PATH}"

# Copy package files and install dependencies
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/docs/package.json ./apps/docs/
COPY apps/gateway/package.json ./apps/gateway/
COPY apps/ui/package.json ./apps/ui/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/models/package.json ./packages/models/
COPY packages/logger/package.json ./packages/logger/
COPY packages/cache/package.json ./packages/cache/
COPY packages/instrumentation/package.json ./packages/instrumentation/
COPY packages/shared/package.json ./packages/shared/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build all apps and create executables for API and Gateway
RUN --mount=type=cache,target=/app/.turbo pnpm build && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        pnpm build:executables:linux-arm64; \
    else \
        pnpm build:executables:linux-x64; \
    fi

FROM debian:12-slim AS runtime

# Install base runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends bash && rm -rf /var/lib/apt/lists/*

# copy nodejs, bun, pnpm, and tini from builder stage
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /usr/local/bin/bun /usr/local/bin/bun
COPY --from=builder /usr/local/bin/pnpm /usr/local/bin/pnpm
COPY --from=builder /usr/bin/tini /tini

# Verify installations
RUN node -v && bun -v && pnpm -v

ENTRYPOINT ["/tini", "--"]

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

FROM debian:12-slim AS api
WORKDIR /app
# Copy the standalone executable based on architecture
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        echo "Using ARM64 executable"; \
    else \
        echo "Using x64 executable"; \
    fi

# Copy the appropriate executable
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        echo "api-server-linux-arm64" > /tmp/executable_name; \
    else \
        echo "api-server-linux-x64" > /tmp/executable_name; \
    fi

COPY --from=builder /app/apps/api/api-server-linux-*.out ./
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        mv api-server-linux-arm64.out api-server 2>/dev/null || true; \
    else \
        mv api-server-linux-x64.out api-server 2>/dev/null || true; \
    fi && \
    chmod +x api-server && \
    ls -la

# copy migrations files for API service to run migrations at runtime
COPY --from=builder /app/packages/db/migrations ./migrations
EXPOSE 80
ENV PORT=80
ENV NODE_ENV=production
ENV TELEMETRY_ACTIVE=true
CMD ["./api-server"]

FROM debian:12-slim AS gateway
WORKDIR /app
# Copy the standalone executable based on architecture
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        echo "Using ARM64 executable"; \
    else \
        echo "Using x64 executable"; \
    fi

COPY --from=builder /app/apps/gateway/gateway-server-linux-*.out ./
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        mv gateway-server-linux-arm64.out gateway-server 2>/dev/null || true; \
    else \
        mv gateway-server-linux-x64.out gateway-server 2>/dev/null || true; \
    fi && \
    chmod +x gateway-server && \
    ls -la

EXPOSE 80
ENV PORT=80
ENV NODE_ENV=production
CMD ["./gateway-server"]

FROM runtime AS ui
WORKDIR /app/temp
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/.npmrc /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm --filter=ui --prod deploy ../dist/ui
RUN rm -rf /app/temp
WORKDIR /app/dist/ui
EXPOSE 80
ENV PORT=80
ENV NODE_ENV=production
CMD ["./node_modules/.bin/next", "start"]

FROM runtime AS worker
WORKDIR /app/temp
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/.npmrc /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm --filter=worker --prod deploy ../dist/worker
RUN rm -rf /app/temp
WORKDIR /app/dist/worker
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "dist/index.js"]

FROM runtime AS docs
WORKDIR /app/temp
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/.npmrc /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm --filter=docs --prod deploy ../dist/docs
RUN rm -rf /app/temp
WORKDIR /app/dist/docs
EXPOSE 80
ENV PORT=80
ENV NODE_ENV=production
CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0"]
