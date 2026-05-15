#!/usr/bin/env bash
# .devcontainer/scripts/build-base.sh — Phase 1 (#1118)
#
# Harmony Dev Container 用 base image を host 側で local build する。
# devcontainer.json の initializeCommand から自動呼出され、container 起動前に
# `harmony-devcontainer-base:local` タグの image を用意する。
#
# Docker layer cache が効くので 2 回目以降は秒で完了 (no-op に近い)。
# 強制 rebuild したい場合は事前に: docker rmi harmony-devcontainer-base:local
#
# Phase 2 で本 script を publish-dev-image.sh に発展、ghcr.io への push を追加予定。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$SCRIPT_DIR/../base"
TAG="harmony-devcontainer-base:local"

if ! command -v docker >/dev/null 2>&1; then
  echo "[harmony-devcontainer] ERROR: docker command not found." >&2
  echo "  WSL2 + Docker Desktop もしくは WSL2 native Docker が必要です。" >&2
  exit 1
fi

echo "[harmony-devcontainer] base image ($TAG) を build (cache hit 時は秒で完了)..."
docker build -t "$TAG" "$BASE_DIR"
echo "[harmony-devcontainer] base image build 完了: $TAG"
