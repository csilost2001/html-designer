# Harmony L1 production Dockerfile (#1055)
#
# 目的: path 規約 (HARMONY_HOME / workspaces 親ディレクトリ) を確定し、
#       将来 L2 (frontend 同梱) / L3 (公開配布) の base を作る。
#
# L1 制約 (本ファイル時点):
#   - frontend は同梱しない。利用者が別途 `cd frontend && npm run dev`
#     する必要がある (L2 で nginx or backend-static-serve で統合予定)
#   - 配布用ではない。本 image は path 規約確定 + L2 への足場のためのみ
#   - multi-arch (amd64/arm64) や healthcheck は L3 で対応
#
# 配布シナリオの想定 (将来):
#   docker run \
#     -v harmony-state:/home/node/.harmony \
#     -v ~/projects:/data/workspaces \
#     -p 5179:5179 \
#     harnize/harmony:1.0
#
# 詳細仕様: docs/spec/path-conventions.md

# ─── stage 1: build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci

COPY backend ./backend
RUN cd backend && npm run build

# ─── stage 2: runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# backend のビルド成果物のみ持ち込み、production 依存を別途 install する
# (build stage の node_modules には devDependencies が含まれるため runtime に
#  そのまま持ち込まず、ここで `npm ci --omit=dev` で再構築する)
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/package-lock.json* ./backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force

# 規約: アプリ state (recent-workspaces.json 等) の置き場
ENV HARMONY_HOME=/home/node/.harmony
VOLUME ["/home/node/.harmony"]

# 規約: workspaces 親ディレクトリ。ユーザーは bind mount で host のフォルダを
#       マッピングするか、named volume を使う。中身は配布時には空。
VOLUME ["/data/workspaces"]

EXPOSE 5179

USER node
CMD ["node", "backend/dist/index.js"]
