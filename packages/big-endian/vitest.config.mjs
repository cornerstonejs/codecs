import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "big-endian",
    include: ["test/**/*.test.js"],
  },
})
