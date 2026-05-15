/**
 * vitest.config.ts — Screen component テスト用最小設定
 *
 * 対象: techStack.frontend.library=react + techStack.frontend.framework=next
 * test runner: vitest + @testing-library/react (D-6 確定)
 *
 * PLACEHOLDER: 実際のプロジェクトでは Next.js プロジェクトルートに配置する。
 * Next.js 付属の jest 設定を使う場合は vitest.config.ts ではなく jest.config.js を使うこともある。
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    react(),
    // tsconfig の paths alias (@/... 等) を vitest でも解決する
    tsconfigPaths(),
  ],
  test: {
    // jsdom: Next.js の DOM API をエミュレート (window / document / fetch)
    environment: 'jsdom',

    // vitest globals (describe / it / expect / vi 等を import なしで使える)
    globals: true,

    // jest-dom のマッチャー (@testing-library/jest-dom) をセットアップ
    setupFiles: ['./src/test/setup.ts'],

    // コンポーネントテストのみ対象 (E2E は playwright が担当)
    include: ['**/*.component.test.{ts,tsx}'],

    // SQLite 並列不可に相当する制約はフロントエンドには無いが、
    // msw サーバーとの競合を避けるため念のため 1 スレッドで実行することを推奨
    // pool: 'forks',
    // poolOptions: { forks: { singleFork: true } },
  },
});

/*
 * src/test/setup.ts (セットアップファイル):
 *
 * import '@testing-library/jest-dom';
 *
 * NOTE: @testing-library/jest-dom の型定義を vitest に認識させるため
 * tsconfig.json の "types" に "@testing-library/jest-dom" を追加すること。
 *
 * 必要な npm パッケージ:
 *   vitest
 *   @vitest/browser (任意、ブラウザ実環境テストが必要な場合)
 *   @testing-library/react
 *   @testing-library/user-event
 *   @testing-library/jest-dom
 *   @vitejs/plugin-react
 *   vite-tsconfig-paths
 *   msw
 *   jsdom
 */
