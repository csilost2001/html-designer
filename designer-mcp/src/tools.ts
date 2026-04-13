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

  // ── カスタムブロック管理 ──

  {
    name: "designer__define_block",
    description:
      "カスタムブロックを定義してデザイナーのブロックカタログに登録します。" +
      "同じ id で再呼び出しすると定義を上書きします。" +
      "ビルトインブロックの id と衝突する場合はエラーになります。" +
      "ブラウザリロード後も保持されます（localStorage 永続化）。",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "ブロックID（一意）。ビルトインブロックのIDとの衝突を避けてください",
        },
        label: {
          type: "string",
          description: "カタログ表示名",
        },
        category: {
          type: "string",
          description: "カテゴリ名。省略時は \"カスタム\"",
        },
        content: {
          type: "string",
          description: "ブロックの HTML コンテンツ",
        },
        styles: {
          type: "string",
          description: "ブロック用 CSS（キャンバス iframe に注入される）。省略可",
        },
        media: {
          type: "string",
          description: "サムネイル SVG/HTML（カタログに表示されるアイコン）。省略可",
        },
      },
      required: ["id", "label", "content"],
    },
  },
  {
    name: "designer__remove_custom_block",
    description:
      "カスタムブロックをカタログと永続化ストアから削除します。" +
      "キャンバス上の既存インスタンスは削除されません。",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "削除するカスタムブロックの ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "designer__list_custom_blocks",
    description:
      "定義済みカスタムブロックの一覧を取得します。" +
      "ビルトイン含む全ブロックは designer__list_blocks で取得できます。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // ── テーブル設計書ツール ──

  {
    name: "designer__list_tables",
    description:
      "プロジェクトに定義されたテーブル設計書の一覧を取得します。各テーブルのID・テーブル名・論理名・カテゴリ・カラム数を返します。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "designer__get_table",
    description:
      "指定テーブルの完全な定義（カラム・インデックス含む）を取得します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        tableId: {
          type: "string",
          description: "取得するテーブルのID（list_tables で取得）",
        },
      },
      required: ["tableId"],
    },
  },
  {
    name: "designer__add_table",
    description:
      "新しいテーブル定義を追加します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "テーブル名（snake_case、例: customers）",
        },
        logicalName: {
          type: "string",
          description: "論理名（例: 顧客マスタ）",
        },
        description: {
          type: "string",
          description: "テーブルの説明",
        },
        category: {
          type: "string",
          description: "カテゴリ（マスタ, トランザクション 等）。省略可。",
        },
      },
      required: ["name", "logicalName"],
    },
  },
  {
    name: "designer__update_table",
    description:
      "テーブル定義を更新します。カラムやインデックスを含む完全な定義を渡します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        tableId: {
          type: "string",
          description: "更新対象のテーブルID",
        },
        definition: {
          type: "object",
          description: "テーブル定義の完全なJSON（TableDefinition型）",
        },
      },
      required: ["tableId", "definition"],
    },
  },
  {
    name: "designer__remove_table",
    description:
      "テーブル定義を削除します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        tableId: {
          type: "string",
          description: "削除するテーブルID",
        },
      },
      required: ["tableId"],
    },
  },
  {
    name: "designer__generate_ddl",
    description:
      "指定テーブルのDDL（CREATE TABLE文）を生成します。SQLダイアレクトを指定できます。",
    inputSchema: {
      type: "object" as const,
      properties: {
        tableId: {
          type: "string",
          description: "DDLを生成するテーブルID。省略で全テーブル。",
        },
        dialect: {
          type: "string",
          enum: ["mysql", "postgresql", "oracle", "sqlite", "standard"],
          description: "SQLダイアレクト。省略時は standard",
        },
      },
      required: [],
    },
  },

  // ── ER図ツール ──

  {
    name: "designer__get_er_diagram",
    description:
      "ER図データ（全テーブル・リレーション・Mermaid記法）を取得します。テーブル設計書の外部キー定義からリレーションを自動検出します。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "designer__export_spec",
    description:
      "プロジェクトの統合仕様書をJSON形式で出力します。テーブル定義・リレーション（物理/論理/概念）・画面情報・画面遷移を含む、PG工程のAIエージェントが正確に解釈可能なフォーマットです。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "designer__generate_er_mermaid",
    description:
      "Mermaid ER図記法を生成します。テーブル設計書の外部キー定義と論理リレーションから生成します。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // ── 処理フロー定義ツール ──

  {
    name: "designer__list_action_groups",
    description:
      "処理フロー定義（アクショングループ）の一覧を取得します。画面・バッチ・共通処理等のタイプ別に管理されます。",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "designer__get_action_group",
    description:
      "指定した処理フロー定義の詳細（アクション・ステップ含む）を取得します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        actionGroupId: {
          type: "string",
          description: "取得するアクショングループのID",
        },
      },
      required: ["actionGroupId"],
    },
  },
  {
    name: "designer__add_action_group",
    description:
      "新しい処理フロー定義（アクショングループ）を作成します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "処理フロー名（例: ログイン画面、月次集計バッチ）",
        },
        type: {
          type: "string",
          enum: ["screen", "batch", "scheduled", "system", "common", "other"],
          description: "種別（screen=画面, batch=バッチ, common=共通処理 等）",
        },
        screenId: {
          type: "string",
          description: "画面ID（type=screen の場合）。省略可。",
        },
        description: {
          type: "string",
          description: "処理フローの説明。省略可。",
        },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "designer__update_action_group",
    description:
      "処理フロー定義を更新します。アクション・ステップを含む完全な定義を渡します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        actionGroupId: {
          type: "string",
          description: "更新対象のアクショングループID",
        },
        definition: {
          type: "object",
          description: "アクショングループ定義の完全なJSON（ActionGroup型）",
        },
      },
      required: ["actionGroupId", "definition"],
    },
  },
  {
    name: "designer__delete_action_group",
    description:
      "処理フロー定義を削除します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        actionGroupId: {
          type: "string",
          description: "削除するアクショングループID",
        },
      },
      required: ["actionGroupId"],
    },
  },
  {
    name: "designer__add_action",
    description:
      "アクショングループにアクション（ボタンクリック等のイベント）を追加します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        actionGroupId: {
          type: "string",
          description: "対象のアクショングループID",
        },
        name: {
          type: "string",
          description: "アクション名（例: 登録ボタン、検索ボタン）",
        },
        trigger: {
          type: "string",
          enum: ["click", "submit", "select", "change", "load", "timer", "other"],
          description: "トリガー種別",
        },
      },
      required: ["actionGroupId", "name", "trigger"],
    },
  },
  {
    name: "designer__add_step",
    description:
      "アクションにステップ（処理手順）を追加します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        actionGroupId: {
          type: "string",
          description: "対象のアクショングループID",
        },
        actionId: {
          type: "string",
          description: "対象のアクションID",
        },
        type: {
          type: "string",
          enum: ["validation", "dbAccess", "externalSystem", "commonProcess", "screenTransition", "displayUpdate", "branch", "jump", "other"],
          description: "ステップ種別",
        },
        description: {
          type: "string",
          description: "ステップの処理概要",
        },
        detail: {
          type: "object",
          description: "ステップ種別固有の詳細（tableName, operation, refId 等）。省略可。",
        },
      },
      required: ["actionGroupId", "actionId", "type", "description"],
    },
  },
];
