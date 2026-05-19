import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "charls",
    include: ["test/**/*.test.js"],
    testTimeout: 30000,
  },
})
