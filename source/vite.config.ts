import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({base:"./",plugins:[react()],resolve:{alias:{"@":fileURLToPath(new URL(".",import.meta.url))}},server:{host:"0.0.0.0",port:4173,allowedHosts:["terminal.local"]},build:{outDir:"../build-output",emptyOutDir:true}});
