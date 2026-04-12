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

  // ── フロー図操作ツール ──

  {
    name: "designer__list_screens",
    description:
      "フロー図に登録されている全画面の一覧を取得します。各画面のID・名前・種別・想定URL・デザイン有無を返します。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "designer__add_screen",
    description:
      "フロー図に新しい画面ノードを追加します。追加後、ブラウザのフロー図に即時反映されます。",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "画面名（例: 顧客一覧）",
        },
        type: {
          type: "string",
          enum: ["login","dashboard","list","detail","form","search","confirm","complete","error","modal","other"],
          description: "画面種別。省略時は other",
        },
        path: {
          type: "string",
          description: "想定URL（例: /customers）。省略可。",
        },
        position: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
          description: "フロー図上の配置座標。省略時は自動配置。",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "designer__update_screen",
    description:
      "既存画面のメタ情報（名前・種別・説明・想定URL）を更新します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        screenId: {
          type: "string",
          description: "更新対象の画面ID（list_screens で取得）",
        },
        name: { type: "string", description: "新しい画面名" },
        type: {
          type: "string",
          enum: ["login","dashboard","list","detail","form","search","confirm","complete","error","modal","other"],
          description: "新しい画面種別",
        },
        description: { type: "string", description: "新しい説明" },
        path: { type: "string", description: "新しい想定URL" },
      },
      required: ["screenId"],
    },
  },
  {
    name: "designer__remove_screen",
    description:
      "画面をフロー図から削除します。関連する遷移エッジとデザインデータも削除されます。",
    inputSchema: {
      type: "object" as const,
      properties: {
        screenId: {
          type: "string",
          description: "削除する画面ID",
        },
      },
      required: ["screenId"],
    },
  },
  {
    name: "designer__add_edge",
    description:
      "2つの画面間に遷移エッジを追加します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description: "遷移元の画面ID",
        },
        target: {
          type: "string",
          description: "遷移先の画面ID",
        },
        label: {
          type: "string",
          description: "遷移ラベル（例: 詳細ボタン）。省略可。",
        },
        trigger: {
          type: "string",
          enum: ["click","submit","select","cancel","auto","back","other"],
          description: "遷移トリガー。省略時は click",
        },
      },
      required: ["source", "target"],
    },
  },
  {
    name: "designer__remove_edge",
    description:
      "遷移エッジを削除します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        edgeId: {
          type: "string",
          description: "削除するエッジID（get_flow で取得）",
        },
      },
      required: ["edgeId"],
    },
  },
  {
    name: "designer__get_flow",
    description:
      "フロー図全体のデータ（全画面・全遷移エッジ）をJSON形式で取得します。プロジェクトの全体像を把握する際に使います。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "designer__navigate_screen",
    description:
      "ブラウザを指定画面のデザイナーへ遷移させます。画面のデザインを編集する前に呼びます。",
    inputSchema: {
      type: "object" as const,
      properties: {
        screenId: {
          type: "string",
          description: "遷移先の画面ID",
        },
      },
      required: ["screenId"],
    },
  },

  // ── React エクスポート ──

  {
    name: "designer__export_screen",
    description:
      "現在デザイナーで開いている画面を React TSX コンポーネントとして出力します。" +
      "事前に designer__navigate_screen で対象画面を開いてから呼んでください（2〜3秒待機）。" +
      "出力されたコードを Claude Code が .tsx ファイルに書き込みます。",
    inputSchema: {
      type: "object" as const,
      properties: {
        screenId: {
          type: "string",
          description: "エクスポート対象の画面ID（list_screens で取得）",
        },
        componentName: {
          type: "string",
          description:
            "生成するコンポーネント名（PascalCase）。省略時は画面名から自動生成（例: 顧客一覧 → ScreenComponent）",
        },
      },
      required: ["screenId"],
    },
  },
];
