import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const config = defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    setupFiles: ["src/testing/setup/vitest.setup.ts"],
    env: {
      ENVIRONMENT: "local",
    },
    // Fork workers time out during startup on slow filesystems (e.g. WSL
    // DrvFS mounts) when too many are spawned in parallel.
    maxWorkers: 4,
  },
});

export default config;
