import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "libjpeg-turbo-8bit",
    include: ["test/**/*.test.js"],
    testTimeout: 30000,
  },
})
