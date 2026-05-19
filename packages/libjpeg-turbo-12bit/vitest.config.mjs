import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "libjpeg-turbo-12bit",
    include: ["test/**/*.test.js"],
    testTimeout: 30000,
  },
})
