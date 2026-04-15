# ── Stage 1: Build WASM ──────────────────────────────────────────────
FROM rust:1.88-slim AS wasm-builder

RUN rustup target add wasm32-unknown-unknown \
 && cargo install wasm-pack

WORKDIR /app/rust/diplomacy-wasm
COPY rust/diplomacy-wasm/ .

RUN wasm-pack build --target bundler --out-dir pkg --release

# ── Stage 2: Install deps & build ────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy WASM artifacts from the previous stage
COPY --from=wasm-builder /app/rust/diplomacy-wasm/pkg/ rust/diplomacy-wasm/pkg/

# Copy the rest of the source
COPY . .

# Remove the rust source (already built) to keep the layer small
RUN rm -rf rust/diplomacy-wasm/src rust/diplomacy-wasm/Cargo.* rust/diplomacy-wasm/Cargo.lock

# Build the Vite app (skip build:rust since WASM is already built)
RUN bunx --bun vite build

# ── Stage 3: Production runtime ──────────────────────────────────────
FROM oven/bun:1-slim AS runtime

WORKDIR /app

# Copy built artifacts and runtime dependencies
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/drizzle/ drizzle/
COPY --from=builder /app/package.json .
COPY --from=builder /app/tsconfig.json .
COPY --from=builder /app/server.ts .
COPY --from=builder /app/migrate.ts .
COPY --from=builder /app/drizzle.config.ts .
COPY --from=builder /app/start.sh .

# Copy database and schema source needed by migrate.ts and server runtime
COPY --from=builder /app/src/database/ src/database/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

RUN chmod +x start.sh

CMD ["./start.sh"]
