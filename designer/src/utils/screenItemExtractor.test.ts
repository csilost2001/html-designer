import { describe, it, expect } from "vitest";
import { extractScreenItemCandidates } from "./screenItemExtractor";

/** GrapesJS 風の char-array components を作るヘルパー */
function gjsFromHtml(html: string): unknown {
  return {
    pages: [{
      frames: [{
        component: {
          components: html.split(""),
        },
      }],
    }],
  };
}

describe("extractScreenItemCandidates", () => {
  it("input[text] を name / label 付きで抽出", () => {
    const html = `
      <form>
        <label for="email">メールアドレス</label>
        <input id="email" name="email" type="text" placeholder="a@b.com" required maxlength="255" />
      </form>
    `;
    const cands = extractScreenItemCandidates(gjsFromHtml(html));
    expect(cands).toHaveLength(1);
    expect(cands[0].name).toBe("email");
    expect(cands[0].label).toBe("メールアドレス");
    expect(cands[0].type).toBe("string");
    expect(cands[0].required).toBe(true);
    expect(cands[0].maxLength).toBe(255);
    expect(cands[0].placeholder).toBe("a@b.com");
  });

  it("input[number] / input[date] / input[checkbox] は type を適切に推定", () => {
    const html = `
      <input name="qty" type="number" min="1" max="9999" />
      <input name="birthday" type="date" />
      <input name="agree" type="checkbox" />
    `;
    const cands = extractScreenItemCandidates(gjsFromHtml(html));
    expect(cands).toHaveLength(3);
    expect(cands[0].name).toBe("qty");
    expect(cands[0].type).toBe("number");
    expect(cands[1].type).toBe("date");
    expect(cands[2].type).toBe("boolean");
  });

  it("button / submit / hidden は除外", () => {
    const html = `
      <input name="csrf" type="hidden" value="x" />
      <input type="submit" value="送信" />
      <button type="button">キャンセル</button>
      <input name="real" type="text" />
    `;
    const cands = extractScreenItemCandidates(gjsFromHtml(html));
    // button タグ自体は対象外、submit/hidden は除外、残るは real の 1 件
    expect(cands).toHaveLength(1);
    expect(cands[0].name).toBe("real");
  });

  it("textarea / select も抽出", () => {
    const html = `
      <label for="bio">自己紹介</label>
      <textarea id="bio" name="bio" required></textarea>
      <label>性別
        <select name="gender">
          <option value="m">男性</option>
          <option value="f">女性</option>
        </select>
      </label>
    `;
    const cands = extractScreenItemCandidates(gjsFromHtml(html));
    expect(cands).toHaveLength(2);
    expect(cands[0].tag).toBe("textarea");
    expect(cands[0].name).toBe("bio");
    expect(cands[0].required).toBe(true);
    expect(cands[1].tag).toBe("select");
    expect(cands[1].name).toBe("gender");
    expect(cands[1].label).toContain("性別");
  });

  it("components に何も無ければ空配列", () => {
    expect(extractScreenItemCandidates({})).toEqual([]);
    expect(extractScreenItemCandidates({ pages: [] })).toEqual([]);
  });

  it("pattern / minLength / maxLength も抽出", () => {
    const html = `<input name="phone" type="text" pattern="\\d{3}-\\d{4}-\\d{4}" minlength="12" maxlength="13" />`;
    const cands = extractScreenItemCandidates(gjsFromHtml(html));
    expect(cands[0].pattern).toBe("\\d{3}-\\d{4}-\\d{4}");
    expect(cands[0].minLength).toBe(12);
    expect(cands[0].maxLength).toBe(13);
  });

  it("data-item-id 属性 (#322) が抽出される", () => {
    const html = `<input name="email" type="text" data-item-id="abc-123-item-id" />`;
    const cands = extractScreenItemCandidates(gjsFromHtml(html));
    expect(cands[0].dataItemId).toBe("abc-123-item-id");
  });

  it("data-item-id 無しなら dataItemId は undefined", () => {
    const html = `<input name="name" type="text" />`;
    const cands = extractScreenItemCandidates(gjsFromHtml(html));
    expect(cands[0].dataItemId).toBeUndefined();
  });

  it("name と data-item-id が両方入った要素から両方取得できる (#328)", () => {
    const html = `
      <input name="user_id" id="user_id" type="text" data-item-id="11000001-0001-4000-8000-aaaaaaaaaaaa"
             placeholder="ユーザーIDを入力" />
    `;
    const cands = extractScreenItemCandidates(gjsFromHtml(html));
    expect(cands).toHaveLength(1);
    expect(cands[0].name).toBe("user_id");
    expect(cands[0].dataItemId).toBe("11000001-0001-4000-8000-aaaaaaaaaaaa");
  });
});
