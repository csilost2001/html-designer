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
  {
    name: "designer__list_blocks",
    description:
      "デザイナーで利用可能なブロック（ブロックカタログ）の一覧を取得します。各ブロックの id / label / category を返します。add_block の blockId 指定に使います。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "designer__add_block",
    description:
      "指定ブロックをキャンバスに追加します。targetId を省略するとキャンバス末尾に追加、指定すると position に従って挿入します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        blockId: {
          type: "string",
          description: "追加するブロックのID（list_blocks で取得）",
        },
        targetId: {
          type: "string",
          description:
            "基準となる既存要素のID（GrapesJSの内部ID）。省略時はキャンバス末尾に追加。",
        },
        position: {
          type: "string",
          enum: ["before", "after", "inside", "append"],
          description:
            "挿入位置。before/after は targetId の兄弟として、inside/append は子として追加。デフォルトは after（targetId あり）または append（なし）。",
        },
      },
      required: ["blockId"],
    },
  },
  {
    name: "designer__remove_element",
    description:
      "指定IDの要素をキャンバスから削除します。要素IDは get_html の結果に含まれる id 属性から取得します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "削除する要素のID（GrapesJSの内部ID）",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "designer__update_element",
    description:
      "指定要素の属性・スタイル・テキスト・クラスを部分更新します。渡したプロパティのみ反映されます。",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "更新対象の要素ID（GrapesJSの内部ID）",
        },
        attributes: {
          type: "object",
          description: "HTML属性のパッチ（キー値ペア）。既存属性にマージされます。",
          additionalProperties: { type: "string" },
        },
        style: {
          type: "object",
          description: "CSSスタイルのパッチ（キー値ペア）。既存スタイルにマージされます。",
          additionalProperties: { type: "string" },
        },
        text: {
          type: "string",
          description:
            "要素内の最初のテキストノードの内容を更新します。構造（子要素）は保持されるため、section-header のように装飾付きの見出しでもタイトル文字だけ安全に差し替え可能。対象にテキストノードが無い場合はエラーになります。",
        },
        classes: {
          type: "array",
          items: { type: "string" },
          description: "クラスリストを完全置換します。",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "designer__set_theme",
    description:
      "デザイナーのテーマを切り替えます。standard / card / compact / dark のいずれかを指定します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        theme: {
          type: "string",
          enum: ["standard", "card", "compact", "dark"],
          description: "適用するテーマID",
        },
      },
      required: ["theme"],
    },
  },
];
