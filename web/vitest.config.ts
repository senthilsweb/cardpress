import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// the same "@/..." path as tsconfig, for tests that load card or component code
export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } } });
