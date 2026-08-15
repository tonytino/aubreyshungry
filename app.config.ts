import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@tanstack/react-start/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Build-time platform flag, not a secret. This is the one sanctioned
  // process.env exception (see AGENTS.md Hard Rules): Vercel sets VERCEL=1
  // during its builds, which needs the "vercel" preset to emit
  // .vercel/output; everywhere else (local dev, CI smoke) keeps the default
  // node-server preset and .output/.
  server: {
    preset: process.env.VERCEL ? "vercel" : "node-server",
  },
  tsr: {
    appDirectory: "app",
  },
  vite: {
    plugins: [tailwindcss(), tsconfigPaths()],
  },
});
