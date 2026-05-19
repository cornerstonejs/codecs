import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "little-endian",
    include: ["test/**/*.test.js"],
  },
})
