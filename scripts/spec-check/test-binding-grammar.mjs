#!/usr/bin/env node
// binding grammar v1 parser の reference 実装 + 動作テスト。
// spec docs/spec/conversion-guideline-for-ai.md §3.1 / §8.2 / §1311 付近で参照。
//
// Usage: node scripts/spec-check/test-binding-grammar.mjs
// Exit code: 0 = all pass, 1 = any fail

const SENTINEL = "[binding.v1] ";

export function parseBindingDescription(d) {
  if (typeof d !== "string") return null;
  if (!d.startsWith(SENTINEL)) return null;
  const body = d.slice(SENTINEL.length).trim();
  if (body === "") return {};
  const out = {};
  for (const pair of body.split(/;\s+/)) {
    if (!pair) continue;
    const i = pair.indexOf("=");
    if (i === -1) throw new Error(`no = in pair: ${pair}`);
    const k = pair.slice(0, i).trim();
    if (!k) throw new Error(`empty key in pair: ${pair}`);
    out[k] = pair.slice(i + 1).trim();
  }
  return out;
}

// 直接実行されたときのみテストを走らせる
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = [
    {
      name: "spec §3.1 example 1 (sentence + source)",
      input: "[binding.v1] binding.attr=th:field; binding.path=form.productCode; source=spec_SC000001_Controller.md#コントロールマッピング",
      expect: {
        "binding.attr": "th:field",
        "binding.path": "form.productCode",
        source: "spec_SC000001_Controller.md#コントロールマッピング",
      },
    },
    { name: "spec §3.1 example 2", input: "[binding.v1] binding.attr=th:field; binding.path=form.quantity", expect: { "binding.attr": "th:field", "binding.path": "form.quantity" } },
    { name: "output role", input: "[binding.v1] binding.attr=th:text; binding.path=viewModel.totalPrice", expect: { "binding.attr": "th:text", "binding.path": "viewModel.totalPrice" } },
    { name: "each loop", input: "[binding.v1] binding.attr=th:each; binding.path=catalog.categories", expect: { "binding.attr": "th:each", "binding.path": "catalog.categories" } },
    { name: "example with note", input: "[binding.v1] binding.attr=th:field; binding.path=form.city; note=都道府県 change 時に options 再生成", expect: { "binding.attr": "th:field", "binding.path": "form.city", note: "都道府県 change 時に options 再生成" } },
    { name: "no sentinel (free text description)", input: "ここは普通の説明文です。", expect: null },
    { name: "empty after sentinel", input: "[binding.v1] ", expect: {} },
    { name: "Japanese path value", input: "[binding.v1] binding.attr=gm:date; binding.path=form.受付日", expect: { "binding.attr": "gm:date", "binding.path": "form.受付日" } },
    { name: "value with colon (th:field)", input: "[binding.v1] binding.attr=th:field", expect: { "binding.attr": "th:field" } },
    { name: "non-string input (null)", input: null, expect: null },
    { name: "non-string input (number)", input: 42, expect: null },
    { name: "non-string input (object)", input: {}, expect: null },
    { name: "non-string input (array)", input: [], expect: null },
  ];

  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      const got = parseBindingDescription(t.input);
      const gotJson = JSON.stringify(got);
      const expJson = JSON.stringify(t.expect);
      if (gotJson === expJson) {
        console.log(`✓ ${t.name}`);
        pass++;
      } else {
        console.log(`✗ ${t.name}\n    expected: ${expJson}\n    got:      ${gotJson}`);
        fail++;
      }
    } catch (e) {
      console.log(`✗ ${t.name} (threw: ${e.message})`);
      fail++;
    }
  }

  // edge case: empty key should throw
  try {
    parseBindingDescription("[binding.v1] =value");
    console.log("✗ empty key should throw");
    fail++;
  } catch (e) {
    if (/empty key/.test(e.message)) {
      console.log("✓ empty key throws as expected");
      pass++;
    } else {
      console.log(`✗ empty key threw wrong error: ${e.message}`);
      fail++;
    }
  }

  console.log();
  console.log(`Pass: ${pass}, Fail: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}
