import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "openjphjs",
    include: ["test/**/*.test.js"],
    testTimeout: 60000,
  },
})
