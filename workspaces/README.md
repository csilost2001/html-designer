# workspaces/

このディレクトリはユーザー / AI のプロジェクト作業領域です。

## 役割

| 場所 | 役割 |
|------|------|
| `workspaces/<wsId>/` | 新規ワークスペースのデフォルト作成先 |
| `data/extensions/` | デザイナー本体組み込み拡張定義 (git tracked) |

- **git 管理対象外**: `workspaces/` 配下の作業フォルダは `.gitignore` により追跡されません (本ファイルと `.gitkeep` を除く)
- **AI ドッグフード**: AI が生成したサンプルプロジェクトや検証用ワークスペースのデフォルト置き場です
- **任意フォルダ open**: UI から任意の絶対パスを開くことも引き続き可能です

## 使い方

### 新規ワークスペースを作成する

1. UI でワークスペース追加ダイアログを開く
2. フォルダのパス欄に `workspaces/<プロジェクト名>/` を入力
3. 「初期化して開く」をクリック

### AI (MCP) から作成する

```bash
# MCP ツール例
designer__workspace_open(path="workspaces/my-project", init=true)
```

## 構造

各ワークスペースは以下の構造を持ちます (`docs/spec/workspace.md` §2.2 参照):

```
workspaces/<wsId>/
  project.json          # 必須 — schemas/v3/project.v3.schema.json 準拠
  screens/
  tables/
  actions/
  conventions/
  sequences/
  views/
  view-definitions/
  extensions/
```

---

This directory is the default workspace area for users and AI agents.
Subdirectories are gitignored; only this README and `.gitkeep` are tracked.
See `docs/spec/workspace.md` for the full specification.
