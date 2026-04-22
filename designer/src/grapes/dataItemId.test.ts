import { describe, it, expect } from "vitest";
import { ensureFormFieldIdentity } from "./dataItemId";
import type { Component } from "grapesjs";

function makeCmp(tag: string, attrs: Record<string, string> = {}): Component {
  const current = { ...attrs };
  return {
    get: (key: string) => (key === "tagName" ? tag : undefined),
    getAttributes: () => ({ ...current }),
    addAttributes: (patch: Record<string, string>) => {
      Object.assign(current, patch);
    },
    _attrs: current,
  } as unknown as Component;
}

describe("ensureFormFieldIdentity", () => {
  it("input drop 時に name / id / data-item-id が同時付与される", () => {
    const cmp = makeCmp("input", { type: "text" });
    const changed = ensureFormFieldIdentity(cmp);
    expect(changed).toBe(true);
    const attrs = cmp.getAttributes();
    expect(attrs["data-item-id"]).toMatch(/^[0-9a-f]{8}-/);
    expect(attrs.name).toMatch(/^field_[0-9a-f]{8}$/);
    expect(attrs.id).toBe(attrs.name);
  });

  it("name の先頭 8 文字は data-item-id の先頭セグメントと一致する", () => {
    const cmp = makeCmp("input", { type: "text" });
    ensureFormFieldIdentity(cmp);
    const attrs = cmp.getAttributes();
    const shortId = attrs["data-item-id"].split("-")[0];
    expect(attrs.name).toBe(`field_${shortId}`);
  });

  it("既に name がある要素は name を上書きしない", () => {
    const cmp = makeCmp("input", { type: "text", name: "my_field" });
    ensureFormFieldIdentity(cmp);
    expect(cmp.getAttributes().name).toBe("my_field");
  });

  it("既に data-item-id がある要素は data-item-id を上書きしない", () => {
    const cmp = makeCmp("input", { type: "text", "data-item-id": "existing-uuid" });
    ensureFormFieldIdentity(cmp);
    expect(cmp.getAttributes()["data-item-id"]).toBe("existing-uuid");
  });

  it("既にすべての属性がある要素は false を返す", () => {
    const cmp = makeCmp("input", {
      type: "text",
      "data-item-id": "uuid-1",
      name: "field_1",
      id: "field_1",
    });
    const changed = ensureFormFieldIdentity(cmp);
    expect(changed).toBe(false);
  });

  it("button type は付与しない", () => {
    const cmp = makeCmp("input", { type: "button" });
    const changed = ensureFormFieldIdentity(cmp);
    expect(changed).toBe(false);
  });

  it("submit type は付与しない", () => {
    const cmp = makeCmp("input", { type: "submit" });
    const changed = ensureFormFieldIdentity(cmp);
    expect(changed).toBe(false);
  });

  it("hidden type は付与しない", () => {
    const cmp = makeCmp("input", { type: "hidden" });
    const changed = ensureFormFieldIdentity(cmp);
    expect(changed).toBe(false);
  });

  it("select に付与される", () => {
    const cmp = makeCmp("select");
    const changed = ensureFormFieldIdentity(cmp);
    expect(changed).toBe(true);
    expect(cmp.getAttributes().name).toMatch(/^field_/);
  });

  it("textarea に付与される", () => {
    const cmp = makeCmp("textarea");
    const changed = ensureFormFieldIdentity(cmp);
    expect(changed).toBe(true);
    expect(cmp.getAttributes()["data-item-id"]).toBeDefined();
  });

  it("div など非 form field は対象外", () => {
    const cmp = makeCmp("div");
    const changed = ensureFormFieldIdentity(cmp);
    expect(changed).toBe(false);
  });
});
