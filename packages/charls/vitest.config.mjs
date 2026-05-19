import { defineConfig } from "vitest/config"
import codspeedPlugin from "@codspeed/vitest-plugin"

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    name: "charls",
    include: ["test/**/*.test.js"],
    benchmark: {
      include: ["bench/**/*.bench.{js,mjs}"],
    },
    testTimeout: 30000,
  },
})
