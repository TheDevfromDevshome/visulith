import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import App from "./App";
import { isDesktopRuntime } from "./lib/bridge";
import { installDesktopWebviewGuards } from "./lib/desktop-guards";

const container = document.getElementById("root");
if (container === null) throw new Error('Missing "#root" element in index.html');

installDesktopWebviewGuards(window, isDesktopRuntime());

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
