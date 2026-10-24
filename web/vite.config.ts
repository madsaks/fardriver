import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { capturePlugin } from "./src/server/capturePlugin";

export default defineConfig({
  plugins: [react(), capturePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@protocol-data": path.resolve(__dirname, "../protocol"),
    },
  },
  server: {
    host: true,
    port: 8787,
    allowedHosts: ["fardriver.madsaks.au", "apptestbench.internal.madsaks.au"],
    hmr: { clientPort: 443 },
  },
});
