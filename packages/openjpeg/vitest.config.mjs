import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "openjpeg",
    include: ["test/**/*.test.js"],
    testTimeout: 60000,
  },
})
