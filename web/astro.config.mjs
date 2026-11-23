// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// BASE_PATH lets the studio live under a sub-path, e.g. BASE_PATH=/studio/social-cards
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  output: "static",
  integrations: [react()],
  // in dev, forward /api to the Go server so the browser sees one origin
  vite: { plugins: [tailwindcss()], server: { proxy: { "/api": process.env.SCS_API_PROXY || "http://127.0.0.1:8080" } } },
  devToolbar: { enabled: false },
});
