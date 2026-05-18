# 開発生産性の抜本的見直し — プレゼン資料

社内ミーティングで使用する Marp ベースのプレゼン資料。

- **対象聴衆**: 現場エンジニア
- **時間**: 40-50 分想定 (複数テーマを 1 つの開発環境改善計画として扱う)
- **作成日**: 2026-05-17 〜
- **記述時点情報**: スライド内の AI ツール比較は 2026-05 時点の公開情報に基づく。本番前に最新化を再確認すること
- **現行ドラフト**: 20260518

## ファイル構成

```
docs/presentation/
├── README.md          # 本ファイル
├── slides.md          # 本体 (Marp markdown)
├── theme.css          # Marp テーマ (色・余白・ヘッダー/フッターの見た目)
├── images/            # スライド埋め込み用画像 (git tracked)
│   └── *.png
└── out/               # ビルド成果物 (gitignore 対象)
    ├── slides.html
    ├── slides.pdf
    └── slides.pptx
```

## ビルド方法

```bash
# 初回のみ
npm install -g @marp-team/marp-cli

# HTML (レビュー・ブラウザ確認用)
marp docs/presentation/slides.md --theme docs/presentation/theme.css -o docs/presentation/out/slides-20260518.html
mkdir -p docs/presentation/out/images
cp docs/presentation/images/draft-20260518-*.svg docs/presentation/out/images/
cp docs/presentation/images/gpt-20260518-*.png docs/presentation/out/images/

# PDF (社内共有・印刷用)
CHROME_PATH=$HOME/.cache/ms-playwright/chromium-1224/chrome-linux64/chrome \
  marp docs/presentation/slides.md --theme docs/presentation/theme.css --pdf --allow-local-files -o docs/presentation/out/slides-20260518.pdf

# PowerPoint (本番)
CHROME_PATH=$HOME/.cache/ms-playwright/chromium-1224/chrome-linux64/chrome \
  marp docs/presentation/slides.md --theme docs/presentation/theme.css --pptx --allow-local-files -o docs/presentation/out/slides-20260518.pptx

# プレビューサーバ (編集中の連続確認)
marp docs/presentation/slides.md --theme docs/presentation/theme.css --server
```

## ヘッダー・フッターの差し替え

`slides.md` の冒頭 frontmatter に以下を置く:

```yaml
---
marp: true
theme: harmony-pitch
paginate: true
header: '{{HEADER_TEXT}}'
footer: '{{FOOTER_TEXT}}'
---
```

`{{HEADER_TEXT}}` / `{{FOOTER_TEXT}}` を社名・部署・機密区分など本番文字列に置換。差し替えは
本番直前に 1 回だけで OK。色・サイズなど見た目は `theme.css` で完結している。

## 出典・参考の管理ルール

1. **スライド内**: 数値・バージョン・リリース日など事実主張をした箇所には `[^1]` `[^2]` の番号脚注を付ける
2. **末尾「参考・出典」スライド**: 全 URL を番号付きでリスト化
3. **speaker notes**: Marp の `<!-- -->` HTML コメントで登壇者向け補足を記述
4. **公式ソース優先**: Anthropic / OpenAI / GitHub / Docker の公式 docs・blog を主軸に、メディア記事は補強用途に限定

## 画像配置ルール

- 本番資料に埋め込む画像 → `docs/presentation/images/` に置き、`![alt](images/xxx.png)` で参照 (git tracked、配布物の一部)
- ドラフト画像 → `docs/presentation/images/draft-YYYYMMDD-*.svg` として置き、採用後にリネームまたは PNG 化を検討
- GPT-Image 生成画像 → `docs/presentation/images/gpt-YYYYMMDD-*.png` として置き、差し戻し可能なよう元 SVG も残す
- AI 作業中の試し撮りスクショ → プロジェクトルール通り `.tmp/screenshots/` に置き、確定後 `images/` に移動

## 編集フロー

1. `slides.md` を編集
2. `marp --server` でプレビューしながら微調整
3. PR で内容レビュー
4. 本番直前にヘッダー/フッター文字列差し替え
5. `--pptx` で pptx 出力 → 必要なら PowerPoint で最終微調整 (アニメーション等)

## 注意事項

- **`docs/presentation/out/` は手編集禁止** (build artifact、次回 build で上書き)
- AI ツール比較の数値は時間で陳腐化するので、本番直前に必ず公式 docs で再確認すること
- スクショに社内固有情報 (顧客名・案件名・実コード等) が写り込んでいないか公開前に必ず確認
