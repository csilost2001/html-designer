import { Routes, Route } from "react-router-dom";
import { FlowEditor } from "./components/flow/FlowEditor";
import { ScreenDesigner } from "./components/ScreenDesigner";
import { TableListView } from "./components/table/TableListView";
import { TableEditor } from "./components/table/TableEditor";
import { ErDiagram } from "./components/table/ErDiagram";
import { ActionListView } from "./components/action/ActionListView";
import { ActionEditor } from "./components/action/ActionEditor";
import "./styles/app.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<FlowEditor />} />
      <Route path="/design/:screenId" element={<ScreenDesigner />} />
      <Route path="/tables" element={<TableListView />} />
      <Route path="/tables/:tableId" element={<TableEditor />} />
      <Route path="/er" element={<ErDiagram />} />
      <Route path="/actions" element={<ActionListView />} />
      <Route path="/actions/:actionGroupId" element={<ActionEditor />} />
    </Routes>
  );
}

export default App;
