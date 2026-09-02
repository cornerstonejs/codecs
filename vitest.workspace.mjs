import { defineWorkspace } from "vitest/config"

export default defineWorkspace([
  "packages/*/vitest.config.mjs",
  "tools/csp/vitest.config.mjs",
])
