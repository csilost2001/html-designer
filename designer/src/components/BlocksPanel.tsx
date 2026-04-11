import { useMemo, useState } from "react";
import type { BlocksResultProps } from "@grapesjs/react";
import type { Block } from "grapesjs";

export function BlocksPanel({ mapCategoryBlocks, dragStart, dragStop }: BlocksResultProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result: [string, Block[]][] = [];
    mapCategoryBlocks.forEach((blocks, cat) => {
      const matched = q
        ? blocks.filter((b) =>
            (b.get("label") || "").toString().toLowerCase().includes(q)
          )
        : blocks;
      if (matched.length) result.push([cat, matched]);
    });
    return result;
  }, [mapCategoryBlocks, query]);

  const toggle = (cat: string) =>
    setCollapsed((s) => ({ ...s, [cat]: !s[cat] }));

  return (
    <div className="blocks-panel">
      <div className="blocks-search">
        <i className="bi bi-search" />
        <input
          type="text"
          placeholder="ブロックを検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="clear-btn" onClick={() => setQuery("")}>
            <i className="bi bi-x-circle-fill" />
          </button>
        )}
      </div>

      <div className="blocks-list">
        {filtered.length === 0 && (
          <div className="blocks-empty">
            <i className="bi bi-inbox" />
            <p>該当するブロックがありません</p>
          </div>
        )}
        {filtered.map(([cat, blocks]) => {
          const isCollapsed = !!collapsed[cat];
          return (
            <section key={cat} className="blocks-category">
              <header
                className="blocks-category-header"
                onClick={() => toggle(cat)}
              >
                <i
                  className={`bi bi-chevron-${isCollapsed ? "right" : "down"}`}
                />
                <span>{cat}</span>
                <span className="count">{blocks.length}</span>
              </header>
              {!isCollapsed && (
                <div className="blocks-grid">
                  {blocks.map((block) => (
                    <div
                      key={block.getId()}
                      className="block-item"
                      draggable
                      onDragStart={(ev) => dragStart(block, ev.nativeEvent)}
                      onDragEnd={() => dragStop(false)}
                      title={block.get("label") || ""}
                    >
                      <div
                        className="block-icon"
                        dangerouslySetInnerHTML={{
                          __html: (block.get("media") as string) || "",
                        }}
                      />
                      <div className="block-label">{block.get("label")}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
