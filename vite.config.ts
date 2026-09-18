import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/PNDR_OBJ3/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  server: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: ["terminal.local"],
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
