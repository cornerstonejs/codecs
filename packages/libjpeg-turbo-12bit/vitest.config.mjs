import { defineConfig } from "vitest/config"
import codspeedPlugin from "@codspeed/vitest-plugin"

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    // Under the CodSpeed simulation instrument the entire process runs ~60x
    // slower under valgrind while vitest's hard-coded 60s worker-RPC timer
    // counts real seconds, so large bench suites structurally hit "Timeout
    // calling onTaskUpdate" AFTER their benches complete and upload. Ignore
    // that exit-code noise in simulation only; walltime and test runs stay
    // strict.
    dangerouslyIgnoreUnhandledErrors:
      process.env.CODSPEED_RUNNER_MODE === "simulation",
    name: "libjpeg-turbo-12bit",
    include: ["test/**/*.test.js"],
    benchmark: {
      include: ["bench/**/*.bench.{js,mjs}"],
    },
    testTimeout: 30000,
  },
})
