/**
 * useWorkspacePath — /w/:wsId/* 規約のパス生成ユーティリティ
 *
 * react-router v7 では useParams() が祖先 Route のパラメータも返す。
 * /w/:wsId/* 配下でマウントされたコンポーネントは wsId を取得できる。
 *
 * 使い方:
 *   const { wsPath } = useWorkspacePath();
 *   navigate(wsPath("/screen/list"));
 *   // → /w/<active-wsId>/screen/list
 */

import { useParams } from "react-router-dom";

interface UseWorkspacePathResult {
  /** /w/:wsId/<suffix> を返す。wsId が取れない場合は <suffix> のまま返す */
  wsPath: (suffix: string) => string;
  /** 現在の wsId (未定の場合は undefined) */
  wsId: string | undefined;
}

export function useWorkspacePath(): UseWorkspacePathResult {
  const { wsId } = useParams<{ wsId: string }>();

  function wsPath(suffix: string): string {
    if (!wsId) return suffix;
    // suffix が "/" で始まる場合は /w/<wsId><suffix>、始まらない場合も同様
    const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
    return `/w/${wsId}${normalizedSuffix}`;
  }

  return { wsPath, wsId };
}
