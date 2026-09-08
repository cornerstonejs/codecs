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
    // (CODSPEED_ENV is set whenever the CodSpeed runner is active; the
    // mode string is "instrumentation" on older runners and "simulation"
    // on newer ones, so match anything except walltime.)
    dangerouslyIgnoreUnhandledErrors:
      process.env.CODSPEED_ENV !== undefined &&
      process.env.CODSPEED_RUNNER_MODE !== "walltime",
    name: "libjxl",
    include: ["test/**/*.test.js"],
    // Codec correctness against real DICOM frames lives in dicom-codec's
    // JPEG XL suite; what is here is the module-level smoke test that suite
    // and the benches both rely on.
    benchmark: {
      include: ["bench/**/*.bench.{js,mjs}"],
    },
    testTimeout: 60000,
  },
})
