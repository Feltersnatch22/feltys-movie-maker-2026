import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Preview } from "./components/Preview/Preview";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const popout = params.get("mode") === "preview";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {popout ? (
      <div className="preview-popout-root">
        <Preview popoutMode />
      </div>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
