## 開発環境 (Dev Containers)

VSCode + Dev Containers 拡張があれば、`git clone` 後に `Reopen in Container` で即環境完成。

1. 前提: Docker Desktop + VSCode + Dev Containers 拡張 (`ms-vscode-remote.remote-containers`)
2. `code .` → 右下のポップアップで「Reopen in Container」をクリック
3. 初回は 5-10 分 (features install + Maven 依存解決)
4. ターミナルで起動:
   ```bash
   ./mvnw spring-boot:run
   ```
5. ブラウザで http://localhost:8080

Postgres は dev container 内では起動しない。必要時のみ:
```bash
docker compose up db
```

詳細: [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json)

## 本番デプロイ (Docker)

```bash
docker compose up --build
```

`Dockerfile` は本番用 multi-stage build (Maven → JRE)、dev は `.devcontainer/` を参照。
