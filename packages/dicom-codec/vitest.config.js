import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "dicom-codec",
    include: ["test/**/*.test.js"],
    testTimeout: 60000,
  },
})
