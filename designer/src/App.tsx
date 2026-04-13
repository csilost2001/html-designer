import { Routes, Route } from "react-router-dom";
import { FlowEditor } from "./components/flow/FlowEditor";
import { ScreenDesigner } from "./components/ScreenDesigner";
import { TableListView } from "./components/table/TableListView";
import { TableEditor } from "./components/table/TableEditor";
import "./styles/app.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<FlowEditor />} />
      <Route path="/design/:screenId" element={<ScreenDesigner />} />
      <Route path="/tables" element={<TableListView />} />
      <Route path="/tables/:tableId" element={<TableEditor />} />
    </Routes>
  );
}

export default App;
