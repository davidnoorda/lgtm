import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
});
