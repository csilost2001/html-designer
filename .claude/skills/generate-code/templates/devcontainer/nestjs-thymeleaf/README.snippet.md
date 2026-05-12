## 開発環境 (Dev Containers)

VSCode + Dev Containers 拡張があれば、`git clone` 後に `Reopen in Container` で即環境完成。

1. 前提: Docker Desktop + VSCode + Dev Containers 拡張 (`ms-vscode-remote.remote-containers`)
2. `code .` → 右下のポップアップで「Reopen in Container」をクリック
3. 初回は 5-10 分 (features install + npm install + prisma generate)
4. DB 初期化 (Prisma + SQLite、dev 用):
   ```bash
   DATABASE_URL=file:./prisma/dev.db npx prisma db push
   ```
5. ターミナルで起動:
   ```bash
   npm run start:dev
   ```
6. ブラウザで http://localhost:3000

**DB**: dev のデフォルトは SQLite (`file:./prisma/dev.db`、Prisma 経由)。Dev Container 内に docker CLI は入っていないため、Postgres を試す場合は **ホスト側ターミナル**で `docker compose up` (Prisma schema を `postgresql` に変える必要あり)。

詳細: [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json)

## 本番デプロイ (Docker)

```bash
docker compose up --build
```

`Dockerfile` は本番用 multi-stage build (NestJS SSR + views)、dev は `.devcontainer/` を参照。production 時に Postgres へ切り替える場合は `docker-compose.yml` のコメントアウト行を有効化し、Prisma schema の provider を変更すること。
