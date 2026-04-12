import { Routes, Route } from "react-router-dom";
import { FlowEditor } from "./components/flow/FlowEditor";
import { ScreenDesigner } from "./components/ScreenDesigner";
import "./styles/app.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<FlowEditor />} />
      <Route path="/design/:screenId" element={<ScreenDesigner />} />
    </Routes>
  );
}

export default App;
