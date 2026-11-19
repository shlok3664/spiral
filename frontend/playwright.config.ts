import { defineConfig } from "@playwright/test"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const frontendDirectory = fileURLToPath(new URL(".", import.meta.url))
const repositoryRoot = resolve(frontendDirectory, "..")
const python = process.env.PYTHON || "python"
const pythonCommand = python.includes(" ") ? `"${python}"` : python

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `${pythonCommand} -m uvicorn api.main:app --host 127.0.0.1 --port 8000`,
      cwd: repositoryRoot,
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      cwd: frontendDirectory,
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
