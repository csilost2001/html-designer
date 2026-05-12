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

# 規約: アプリ state (recent-workspaces.json 等) の置き場 + workspaces 親ディレクトリ
# Docker は named volume を初期化する際 image 内の対応ディレクトリの所有者・モードを
# volume にコピーする。VOLUME 宣言**前**にディレクトリを mkdir + chown して
# `node` 所有にしておかないと、named volume が root:root で初期化されて `USER node`
# 起動後の app が EACCES で書き込めない (Sonnet review Must-fix #1057)。
RUN mkdir -p /home/node/.harmony /data/workspaces \
    && chown -R node:node /home/node/.harmony /data/workspaces

ENV HARMONY_HOME=/home/node/.harmony
VOLUME ["/home/node/.harmony", "/data/workspaces"]

EXPOSE 5179

USER node
CMD ["node", "backend/dist/index.js"]
