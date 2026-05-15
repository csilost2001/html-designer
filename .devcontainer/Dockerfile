# Harmony Dev Container OVERLAY (#1118 Phase 1)
#
# 目的: 頻繁更新ツールを base image に焼かず、薄い overlay 層に閉じ込めて
#       rebuild 時のコストを最小化。
#
# 階層構造:
#   .devcontainer/base/Dockerfile  ← Playwright + Chromium + apt (稀更新)
#   .devcontainer/Dockerfile       ← codex 等の頻繁更新ツール (本ファイル)
#
# 更新タイミング (頻繁、月単位):
#   - @openai/codex version bump (このファイルを編集 → Rebuild Container)
#   - 将来追加の頻繁更新 CLI も本ファイルに追記
#
# Phase 1 計測 (Ryzen): warm rebuild 15 秒、codex 更新時の rebuild ~5 秒目標。
#
# FROM は Phase 1 では local tag、Phase 2 で ghcr URL に切替予定:
#   Phase 1: FROM harmony-devcontainer-base:local
#   Phase 2: FROM ghcr.io/csilost2001/harmony-devcontainer-base:<version>

FROM harmony-devcontainer-base:local

USER root

# @openai/codex (頻繁更新ツール、本 overlay 層に閉じ込め)
RUN npm install -g @openai/codex@0.130.0

USER node
