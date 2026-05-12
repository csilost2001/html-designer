## 開発環境 (Dev Containers)

VSCode + Dev Containers 拡張があれば、`git clone` 後に `Reopen in Container` で即環境完成。

1. 前提: Docker Desktop + VSCode + Dev Containers 拡張 (`ms-vscode-remote.remote-containers`)
2. `code .` → 右下のポップアップで「Reopen in Container」をクリック
3. 初回は 5-10 分 (features install + npm install × 2)
4. ターミナル 2 つで起動:
   ```bash
   # ターミナル 1: Backend (NestJS)
   cd backend
   npm run start:dev

   # ターミナル 2: Frontend (Next.js)
   cd frontend
   npm run dev
   ```
5. ブラウザで http://localhost:3001 (Next.js)、Backend API は http://localhost:3000

Postgres は dev container 内では起動しない。必要時のみ:
```bash
docker compose up db
```

詳細: [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json)

## 本番デプロイ (Docker)

```bash
docker compose up --build
```

`Dockerfile` は本番用 multi-stage build (NestJS + Next.js)、dev は `.devcontainer/` を参照。
