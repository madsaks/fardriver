import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MuiThemeProvider, SafeAreaBox, ThemeProvider } from "@xenapseai/ui-kit";
import { App } from "./App";
import { registerServiceWorker } from "./pwa/registerServiceWorker";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      tokens={{
        colors: {
          background: "#f8faf7",
          canvas: "#ffffff",
          border: "#d8ded4",
          muted: "#e8eee5",
          text: {
            primary: "#111411",
            secondary: "#5d665b",
            disabled: "#8c9489",
          },
          accent: {
            blue: "#386a20",
            green: "#2f6f4e",
            red: "#ba1a1a",
            amber: "#765900",
            purple: "#68548e",
            cyan: "#006a6a",
          },
        },
        typography: {
          fontFamily: "Inter, Roboto, system-ui, sans-serif",
          sizes: {
            header: "0.875rem",
            body: "0.875rem",
            detail: "0.75rem",
          },
        },
      }}
    >
      <MuiThemeProvider>
        <SafeAreaBox>
          <App />
        </SafeAreaBox>
      </MuiThemeProvider>
    </ThemeProvider>
  </StrictMode>,
);

void registerServiceWorker();
