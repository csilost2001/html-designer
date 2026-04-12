import { useState } from "react";
import type {
  StylesResultProps,
  SelectorsResultProps,
  TraitsResultProps,
  LayersResultProps,
} from "@grapesjs/react";
import type { ComponentType } from "react";

type ProviderChildren<T> = (props: T) => React.ReactElement;

interface Props {
  StylesProvider: ComponentType<{ children: ProviderChildren<StylesResultProps> }>;
  SelectorsProvider: ComponentType<{ children: ProviderChildren<SelectorsResultProps> }>;
  TraitsProvider: ComponentType<{ children: ProviderChildren<TraitsResultProps> }>;
  LayersProvider: ComponentType<{ children: ProviderChildren<LayersResultProps> }>;
}

type TabId = "styles" | "traits" | "layers";

export function RightPanel({
  StylesProvider,
  SelectorsProvider,
  TraitsProvider,
  LayersProvider,
}: Props) {
  const [tab, setTab] = useState<TabId>("styles");

  return (
    <div className="right-panel">
      <div className="right-tabs">
        <button
          className={tab === "styles" ? "active" : ""}
          onClick={() => setTab("styles")}
        >
          <i className="bi bi-brush" /> スタイル
        </button>
        <button
          className={tab === "traits" ? "active" : ""}
          onClick={() => setTab("traits")}
        >
          <i className="bi bi-sliders" /> 属性
        </button>
        <button
          className={tab === "layers" ? "active" : ""}
          onClick={() => setTab("layers")}
        >
          <i className="bi bi-stack" /> レイヤー
        </button>
      </div>

      <div className="right-content">
        <div hidden={tab !== "styles"}>
          <SelectorsProvider>
            {({ Container }) => (
              <div className="panel-block">
                <div className="panel-block-title">セレクタ</div>
                <Container />
              </div>
            )}
          </SelectorsProvider>
          <StylesProvider>
            {({ Container }) => (
              <div className="panel-block">
                <div className="panel-block-title">スタイル</div>
                <Container />
              </div>
            )}
          </StylesProvider>
        </div>
        <div hidden={tab !== "traits"}>
          <TraitsProvider>
            {({ Container }) => (
              <div className="panel-block">
                <div className="panel-block-title">属性</div>
                <Container />
              </div>
            )}
          </TraitsProvider>
        </div>
        <div hidden={tab !== "layers"}>
          <LayersProvider>
            {({ Container }) => (
              <div className="panel-block">
                <div className="panel-block-title">レイヤー</div>
                <Container />
              </div>
            )}
          </LayersProvider>
        </div>
      </div>
    </div>
  );
}
