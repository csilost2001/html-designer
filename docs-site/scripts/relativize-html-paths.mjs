#!/usr/bin/env node
/**
 * docs/html/ 配下の全 HTML / CSS 内の絶対パス (`/foo/`, `/_astro/...`) を
 * 各ファイルから見た相対パスに書き換える post-build script。
 *
 * 目的: `file://` プロトコルで `docs/html/index.html` 等を直接開いた時にも
 *       リンク・asset が動作するようにする。HTTP server 経由でも同様に動作
 *       (相対パスは絶対パスのスーパーセット)。
 *
 * 背景: Astro は built-in で相対 URL 出力をサポートしない (公式 doc 確認済)。
 *       `<base href>` 単純追加は深い page で path 解決が壊れるため不可。
 *       各 file 単位で深さを計算して prefix を rewrite する必要がある。
 *
 * 対象:
 * - href="/..." → href="<相対prefix>..."
 * - src="/..."  → src="<相対prefix>..."
 * - url(/...)   → url(<相対prefix>...)  (CSS / inline style)
 *
 * 除外:
 * - href="http://..." / "https://..." / "//..." (外部 URL)
 * - href="#..." (アンカーリンク)
 * - href="mailto:..." / "tel:..."
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', 'docs', 'html');

/**
 * file から見て docs/html ルートまでの相対 prefix を返す。
 * - docs/html/index.html → './'
 * - docs/html/spec/foo/index.html → '../../'
 */
function relPrefix(file) {
  const fromDir = dirname(file);
  const rel = relative(fromDir, ROOT);
  // relative() は同 dir なら '' を返す → './' にする
  if (rel === '') return './';
  return rel.endsWith('/') ? rel : `${rel}/`;
}

/**
 * 絶対パス link (/foo/...) を相対パス (./foo/... or ../foo/...) に rewrite。
 * 外部 URL / アンカー / mailto / tel は skip。
 */
function rewrite(content, prefix) {
  return content
    // href="/..." (ただし //... は外部、http://... も skip)
    .replace(/(\s(?:href|src))="\/(?!\/)([^"]*)"/g, (_, attr, path) => {
      return `${attr}="${prefix}${path}"`;
    })
    // url(/...) in CSS / inline style
    .replace(/url\(\s*\/(?!\/)([^)\s]*)\s*\)/g, (_, path) => {
      return `url(${prefix}${path})`;
    });
}

/**
 * docs/html/ 配下を再帰 walk、対象拡張子の絶対パスを集める。
 * pagefind/ 配下は除外 (binary + 動的生成 + 検索 worker が独自パス解決)。
 */
async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'pagefind') continue;
      files.push(...(await collectFiles(full)));
    } else if (/\.(html|css|js)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const files = await collectFiles(ROOT);

  let rewriteCount = 0;
  for (const file of files) {
    const prefix = relPrefix(file);
    const original = await readFile(file, 'utf8');
    const rewritten = rewrite(original, prefix);
    if (original !== rewritten) {
      await writeFile(file, rewritten);
      rewriteCount++;
    }
  }

  console.log(
    `[relativize-html-paths] ${rewriteCount}/${files.length} files rewritten (HTML+CSS+JS、pagefind/ 除外)`
  );
}

main().catch((err) => {
  console.error('[relativize-html-paths] ERROR:', err);
  process.exit(1);
});
