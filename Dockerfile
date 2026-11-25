# syntax=docker/dockerfile:1
# --- build stage: install deps, bundle client + server ---
FROM node:22-slim AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY tools/package.json tools/
RUN npm ci
COPY shared shared
COPY server server
COPY client client
RUN node client/build.mjs && node server/build.mjs

# TRUST_PROXY is deliberately NOT set here: a plain `docker run -p` would let clients forge X-Forwarded-For and dodge the
# per-IP PIN limiter. compose.yml sets it for the Caddy-fronted deployment.
# --- final stage: bundle only (ws is bundled in, no node_modules needed) ---
FROM node:22-slim
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /app
# Layout the server expects: <root>/server/dist/index.js and <root>/client/dist
COPY --from=build /src/server/dist/index.js /src/server/dist/index.js.map ./server/dist/
COPY --from=build /src/client/dist ./client/dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server/dist/index.js"]
