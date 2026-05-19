import { defineConfig } from "vitest/config"
import codspeedPlugin from "@codspeed/vitest-plugin"

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    name: "big-endian",
    include: ["test/**/*.test.js"],
    benchmark: {
      include: ["bench/**/*.bench.{js,mjs}"],
    },
  },
})
