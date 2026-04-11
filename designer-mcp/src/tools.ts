export const tools = [
  {
    name: "designer__get_html",
    description: "現在のデザイナーキャンバスのHTMLとCSSを取得します。デザイン内容の確認・分析に使います。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "designer__set_components",
    description:
      "デザイナーキャンバスのコンテンツを指定HTMLで完全に置換します。新しいデザインをデザイナーに適用する際に使います。",
    inputSchema: {
      type: "object" as const,
      properties: {
        html: {
          type: "string",
          description: "置換するHTML文字列。GrapesJSのコンポーネントとして解釈されます。",
        },
      },
      required: ["html"],
    },
  },
  {
    name: "designer__screenshot",
    description:
      "デザイナーキャンバスのスクリーンショットをPNG画像で取得します。現在のビジュアルを確認する際に使います。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
