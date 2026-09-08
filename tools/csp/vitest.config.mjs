import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "csp",
    include: ["*.test.js"],
  },
})
