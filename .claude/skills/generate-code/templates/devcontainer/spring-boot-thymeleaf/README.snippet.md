## 開発環境 (Dev Containers)

VSCode + Dev Containers 拡張があれば、`git clone` 後に `Reopen in Container` で即環境完成。

1. 前提: Docker Desktop + VSCode + Dev Containers 拡張 (`ms-vscode-remote.remote-containers`)
2. `code .` → 右下のポップアップで「Reopen in Container」をクリック
3. 初回は 5-10 分 (features install + Maven 依存解決)
4. ターミナルで起動 (Maven Wrapper があれば優先、無ければ system mvn を使用):
   ```bash
   ./mvnw spring-boot:run 2>/dev/null || mvn spring-boot:run
   ```
5. ブラウザで http://localhost:8080

Postgres を使う場合は **ホスト側 (WSL2 / macOS / Windows) ターミナル**で:
```bash
docker compose up db
```
(Dev Container 内には docker CLI を入れていないため、コンテナ内シェルからは実行できません)

詳細: [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json)

## 本番デプロイ (Docker)

```bash
docker compose up --build
```

`Dockerfile` は本番用 multi-stage build (Maven → JRE 21)、dev は `.devcontainer/` を参照。
