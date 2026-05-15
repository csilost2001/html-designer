# Harmony 配布形態ロードマップ — Docker image 化構想

Harmony 本体 (frontend + backend) を Docker image として配布し、利用者が `git clone` せずに `docker compose up` だけで起動できるようにする構想。

> ⚠️ **本書は構想 / ロードマップであり、現状未実装です** (2026-05-15 時点)。
>
> - 着手は #1055 の L2 / L3 で本格化予定 (近日着手予定、本書を起点に書き直す前提)
> - 関連: [#1055 L1 production Dockerfile 雛形](https://github.com/csilost2001/harmony/issues/1055) (closed、本書記載の前段 path 規約と L2/L3 方針あり)
>
> ⚠️ **本書記載の 2-container 案は #1055 L2 方針 (backend-static-serve で 1 container 統合) と矛盾しています**。L2 着手時には **1-container 案** (backend が `express.static()` で `frontend/dist/` を配信、5179 ポートで HTTP MCP / WebSocket / SPA 全部) で書き直す前提で、本書の compose 構成 (frontend + backend 2 サービス) は**そのまま採用しないでください**。
>
> ✅ ただし **本書の構造 (Step 2-1 〜 2-8) と方針は historical reference として保持しています**。ghcr.io への push 手順 / GitHub Actions / volume mount 設計 / トラブルシューティング等は 1-container 案でもそのまま使えるため、L2/L3 着手者の出発点として読む価値があります。

開発環境セットアップ手順は本書の対象外です。Harmony 本体を開発したい場合は [`dev-containers.md`](./dev-containers.md) (推奨) または [`wsl2-native.md`](./wsl2-native.md) (代替) を参照してください。

---

## L2 着手前の必須設計判断 (バトン情報)

#1055 L2 着手者はまず本節を読んでから書き直しに入ること。Step 2-1〜2-8 (後述) はこの設計判断に従って再構成する必要がある。

### 1. AI mount は optional + Codex は optional

Harmony backend は **Codex App Server を lazy 接続** (`wsBridge.ts:247` `_codexConn: CodexConnection | null = null`)。backend 起動時に codex は spawn されず、利用者が「処理フローの `kind: "ai"` step 実行」または「UI の Codex 統合タブ操作」をして初めて接続を試みる。

つまり **Codex 未インストール / 未認証でも Harmony 設計ツールは動作する**:

| 機能 | Codex 依存 |
|---|---|
| 画面 / テーブル / 処理フロー / ER 図 / Page Layout 設計 (GUI) | ❌ 依存しない |
| `/generate-code` / `/generate-tests` (Claude Code 等別 MCP クライアント経由) | ❌ 依存しない |
| 処理フロー `kind: "ai"` step の実行 | ✅ 必要 |
| UI 内 Codex タブ (login / chat / rate limit 表示) | ✅ 必要 |

**結論**: 配布利用者向け `docker-compose.yml` では:

- **`.codex` mount は default で comment-out**、「Codex 機能を使う場合は uncomment」と注釈
- backend image に codex CLI を install するかは選択 (推奨: install しておく + mount で auth 渡す。L2 着手時に image サイズ実測して判断)
- Codex 機能を使わない利用者層は `.codex` mount 無しで完全に Harmony を使える

### 2. 利用者層を 3 区分で想定する

| 利用者層 | サブスク状況 | 必要な構成 |
|---|---|---|
| **(2a) 設計のみ利用** | Codex / Claude サブスクなし | `.codex` mount 不要、AI 機能未利用、GUI で JSON 出力まで完結 |
| **(2b) Codex 利用** | ChatGPT Plus 契約あり | `.codex` mount + container 内 codex CLI で AI step / Codex タブ動作 |
| **(2c) Claude 利用** | Anthropic Pro/Max 契約あり | Harmony image 内では使わない。Harmony 外 (Desktop の Claude Code 等) から MCP 経由で port 5179 に接続 |

(2a) を排除しない compose 設計が重要 (= mount は default で **無し**、欲しい人だけ追加)。

### 3. Codex 通信は stdio 一択 (WebSocket は公式 unsupported)

Codex App Server の公式 transport ([OpenAI Developers](https://developers.openai.com/codex/app-server) / [GitHub openai/codex codex-rs/app-server/README.md](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)):

| Transport | フラグ | 状態 | 配布利用 |
|---|---|---|---|
| **stdio** (default) | `--listen stdio://` | ✅ supported | **採用** |
| **WebSocket** | `--listen ws://IP:PORT` | ⚠️ experimental and unsupported | **採用しない** |
| **unix socket** | `--listen unix://` | local control-plane only | 非該当 |
| **off** | `--listen off` | (disable) | 非該当 |

公式 README 明記: *"Websocket transport is currently experimental and unsupported. Do not rely on it for production workloads."*

Harmony backend は両方を実装済 (`backend/src/codex/config.ts` の `HARMONY_CODEX_TRANSPORT` env)。L2 では **default = stdio (container 内 spawn)** で進める。`HARMONY_CODEX_TRANSPORT=websocket` 経路は上級ユーザ向け escape hatch として残すが、配布 compose のサンプルでは推奨しない。

### 4. Codex 統合の compose スニペット (推奨形、L2 着手者が起点に使う)

1-container 統合案 + Codex optional mount のサンプル:

```yaml
services:
  harmony:
    image: ghcr.io/csilost2001/harmony:1.0.0
    ports:
      - "5179:5179"               # HTTP MCP + WebSocket + SPA (express.static で statically serve)
    volumes:
      - ./workspaces:/data/workspaces                      # 利用者の作業データ (必須)
      - harmony-state:/home/node/.harmony                  # recent-workspaces.json (必須、named volume)
      # ↓ Codex 機能を使う場合のみ uncomment (= 利用者層 (2b))
      # - ${HOME}/.codex:/home/node/.codex:ro              # ChatGPT Plus OAuth credential (host で `codex login` 必要)
    environment:
      NODE_ENV: production
      # HARMONY_CODEX_TRANSPORT: spawn                     # default
    restart: unless-stopped

volumes:
  harmony-state:
```

- `.codex` は **read-only mount** (container 内で書き換えない、host の credential を読むだけ)
- `:ro` を付けることで container 内の AI step が誤って credential を上書きするリスクを排除
- 利用者層 (2a) はこの mount をコメントアウトのままで OK
- 利用者層 (2b) は uncomment + host で 1 度 `codex login` 完了させる
- 利用者層 (2c) は Harmony image を使わず、自分の手元の Claude Code Desktop 等から MCP 接続のみ

### 5. Step 2-1 〜 2-8 の書き直し方針 (要約)

| Step | 旧案 (本書) | L2 で書き直す方向 |
|---|---|---|
| 2-1 | frontend/Dockerfile | **削除** (1-container 案では不要、backend Dockerfile に統合) |
| 2-2 | backend/Dockerfile | **frontend を multi-stage で同梱**、backend が `express.static()` で `frontend/dist/` を配信 |
| 2-3 | docker-compose.yml (2 services) | **1 service** (上記スニペット参照)、Codex mount は optional |
| 2-4 | docker-compose.dev.yml | L2 では不要 (開発は `.devcontainer/` で完結)。最低限必要なら別ファイルで |
| 2-5 | ローカルビルド + 統合テスト | 1 image / 1 container のテストフローに置き換え |
| 2-6 | ghcr.io push | そのまま使える (tag 付け / login / push 手順は変わらず) |
| 2-7 | README に手順追加 | top-level README.md (#1109 で新設済) に「`docker compose up` で起動」セクションを追記する形に修正 |
| 2-8 | GitHub Actions release | そのまま使える (1 image build に簡略化される分むしろ簡単) |

---

## 目的

Harmony 本体の利用者 (= 業務アプリ設計者、AGENTS.md の (2)) のうち、コードを触らず GUI と `/generate-code` だけ使いたい層向けに「**`docker compose up` だけで起動**」の経路を用意する。

現状は (1) 開発者と (2) 利用者の経路が同じで、利用者にも `git clone` + Dev Containers セットアップを要求している。image 化により (2) は image pull だけで完了する。

(3) エンドユーザ (生成された業務アプリの利用者) は本書のスコープ外。生成アプリ側の `.devcontainer/` / `Dockerfile` で扱う (`.claude/skills/generate-code/templates/` 担当)。

---

## 想定実施タイミング

- Harmony 本体の動作が安定し、頻繁な breaking change が落ち着いてから
- 社内他メンバーへのツール配布が必要になった時
- 客先 demo 用途が出てきた時
- OSS 公開を検討する時

#1055 ISSUE body によれば、L2 = frontend 同梱 / 自己ホスト image、L3 = 公開配布 (ghcr.io)。本書は L2/L3 の起点として残す。

---

## Step 2-1: frontend/Dockerfile 作成

> ⚠️ **再検討対象**: 1-container 案では本 Dockerfile は不要 (backend が SPA を serve するため frontend 単独の image は作らない)。

`frontend/Dockerfile` を新規作成。multi-stage ビルドで配布用 image をスリムに:

```dockerfile
# Stage 1: ビルド
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: 配布
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
```

**注意**: `frontend` の Vite ビルドが SPA 静的成果物を出す前提。ルーティング・環境変数まわりは要確認 (実コード参照)。

#### 成功確認
- [ ] `docker build -t harmony:local ./frontend` が成功
- [ ] `docker run --rm -p 5173:5173 harmony:local` で起動
- [ ] ブラウザで `http://localhost:5173` でデザイナー UI 表示

---

## Step 2-2: backend/Dockerfile 作成

> ⚠️ **再検討対象**: 1-container 案では本 Dockerfile を **backend + frontend 統合 Dockerfile** に書き直す。stage 1 で frontend を build、stage 2 で backend に dist/ をコピーして `express.static()` で配信する構成。

`backend/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 5179
CMD ["node", "dist/index.js"]
```

**注意**:
- ビルドコマンド (`npm run build`) と起動エントリ (`dist/index.js`) は実 package.json に合わせる
- WebSocket と HTTP MCP が同 port 5179 に同居している前提

#### 成功確認
- [ ] `docker build -t harmony-backend:local ./backend` が成功
- [ ] image サイズが妥当 (~200-400MB)

---

## Step 2-3: docker-compose.yml (配布用)

> ⚠️ **再検討対象**: 1-container 案では `services:` は **1 つだけ** (`harmony`) になる。frontend + backend を分けない。

リポジトリルートに `docker-compose.yml`:

```yaml
services:
  frontend:
    image: ghcr.io/<org>/harmony:latest
    ports:
      - "5173:5173"
    depends_on:
      - backend
    restart: unless-stopped

  backend:
    image: ghcr.io/<org>/harmony-backend:latest
    ports:
      - "5179:5179"
    volumes:
      - ./workspaces:/app/workspaces
      - ./data:/app/data
      - ./examples:/app/examples:ro
    environment:
      NODE_ENV: production
    restart: unless-stopped
```

`<org>` は実際の GitHub org 名に置換する。

#### 成功確認
- [ ] `docker compose config` で構文エラーなし
- [ ] `docker compose up` で両サービス起動 (image を local に書き換えて事前テスト)
- [ ] ブラウザでデザイナー動作 OK
- [ ] `./workspaces/` にホスト側ファイルが書き込まれる

---

## Step 2-4: docker-compose.dev.yml (任意、メンテナ Docker dev 用)

通常メンテナは Dev Containers で開発するが、Docker compose でも開発できる状態を用意したい場合のみ:

```yaml
services:
  frontend:
    image: node:20-alpine
    working_dir: /app
    command: sh -c "npm install && npm run dev -- --host 0.0.0.0"
    ports: ["5173:5173"]
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      VITE_HOST: 0.0.0.0

  backend:
    image: node:20-alpine
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    ports: ["5179:5179"]
    volumes:
      - ./backend:/app
      - /app/node_modules
      - ./workspaces:/workspaces
      - ./data:/data
      - ./examples:/examples
```

使い方: `docker compose -f docker-compose.dev.yml up`

#### 成功確認
- [ ] (任意) Docker dev でも HMR が動作する
- [ ] (任意) ホスト側ソース変更がブラウザに反映される

---

## Step 2-5: ローカルビルド + 統合テスト

local image で compose 動作確認:

```bash
cd ~/projects/harmony

# build
docker build -t harmony:local ./frontend
docker build -t harmony-backend:local ./backend

# compose の image 名を一時的に local に書き換えてテスト
# (sed でも手動でも)
docker compose up

# 動作確認後 Ctrl+C で停止
docker compose down
```

#### 成功確認
- [ ] 両 image build 成功 (warning のみ許容、error はゼロ)
- [ ] `docker compose up` で両コンテナ起動
- [ ] ブラウザでデザイナー操作可
- [ ] AI エージェントから MCP 接続可 (Claude Code 等)
- [ ] `workspaces/` 永続化動作

---

## Step 2-6: GitHub Container Registry に push

```bash
# GitHub Token (write:packages 権限) で認証
echo $GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin

# tag 付け
docker tag harmony:local ghcr.io/<org>/harmony:0.1.0
docker tag harmony:local ghcr.io/<org>/harmony:latest
docker tag harmony-backend:local ghcr.io/<org>/harmony-backend:0.1.0
docker tag harmony-backend:local ghcr.io/<org>/harmony-backend:latest

# push
docker push ghcr.io/<org>/harmony:0.1.0
docker push ghcr.io/<org>/harmony:latest
docker push ghcr.io/<org>/harmony-backend:0.1.0
docker push ghcr.io/<org>/harmony-backend:latest
```

GitHub の Packages タブで image が公開されたか確認。private/public 設定も適切に。

#### 成功確認
- [ ] `docker pull ghcr.io/<org>/harmony:0.1.0` が別環境で成功
- [ ] GitHub の Package ページで image が見える

---

## Step 2-7: README に利用手順を追加

`README.md` または `docs/installation.md` に Docker 利用手順を追加:

```markdown
## Docker での起動

任意のディレクトリで:

\`\`\`bash
mkdir my-design-project && cd my-design-project
curl -O https://raw.githubusercontent.com/<org>/harmony/main/docker-compose.yml
docker compose up
\`\`\`

ブラウザで http://localhost:5173 を開く。
JSON 仕様は ./workspaces/ 配下に保存される。
```

#### 成功確認
- [ ] README から Docker 利用方法に到達できる
- [ ] 別マシン (or 別 WSL2 distro) で手順通りに起動成功

---

## Step 2-8: CI でリリース時 image build を自動化 (任意)

GitHub Actions で git tag push 時に image build → ghcr.io push を自動化。`.github/workflows/release.yml` 等に追加。詳細は別途 CI 設計を行う。

#### 成功確認
- [ ] tag push で workflow が走る
- [ ] ghcr.io に新バージョン image が push される

---

## 完了条件 (将来 L2/L3 着手時)

- [ ] `Dockerfile` (1-container 統合版) commit 済み
- [ ] `docker-compose.yml` (1 サービス版) commit 済み
- [ ] ghcr.io に image 公開済み
- [ ] README に利用手順記載済み
- [ ] 別環境で `docker compose up` のみで起動できることを確認済み

---

## トラブルシューティング (実装時に再検証)

| 症状 | 原因 / 対処 |
|---|---|
| Docker build で permission denied | `node_modules` が bind mount に巻き込まれている → named volume で隔離 (compose の `- /app/node_modules`) |
| compose up しても画面が出ない | Dev Containers 開発環境が同時起動していてポート競合。両方は同時起動できない |
| volume mount したファイルの権限おかしい | コンテナの user UID とホスト UID 不一致。Dockerfile に `USER node` 等を追加 or 起動時に `--user` 指定 |
| ghcr.io への push が 401 | GitHub token に `write:packages` スコープが必要 |

---

## 関連ドキュメント

- [`AGENTS.md`](../../AGENTS.md) — プロジェクト全般のガイダンス
- [`CLAUDE.md`](../../CLAUDE.md) — Claude Code 固有の設定
- [`dev-containers.md`](./dev-containers.md) — 開発環境 (推奨)
- [`wsl2-native.md`](./wsl2-native.md) — 開発環境 (代替)
- ISSUE [#1055](https://github.com/csilost2001/harmony/issues/1055) — L1 Dockerfile + L2/L3 方針記載
- ISSUE [#847](https://github.com/csilost2001/harmony/issues/847) — Dev Containers 移行 roadmap (closed)

---

## 改訂履歴

| 日付 | 改訂内容 |
|---|---|
| 2026-05-06 | 旧 `wsl2-docker-migration.md` Phase 2 として初版 |
| 2026-05-15 | `distribution-roadmap.md` に分離 (#1109)。Phase 用語廃止、1-container 案 (#1055 L2 方針) との矛盾 banner 追加、L2/L3 着手時の書き直し前提に明示 |
