import { expect, test } from "@playwright/test"

test("sample upload shows scored predictions and label metrics", async ({ page }) => {
  await page.goto("/#analyze")
  await page.getByRole("button", { name: "Try a sample file" }).click()

  await expect(page.getByRole("heading", { name: "Analysis results" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Evaluation" })).toBeVisible()
  await expect(page.getByRole("table", { name: /Confusion matrix/ })).toBeVisible()
  await expect(page.getByText("Scored by XGBoost", { exact: false }).first()).toBeVisible()
})

test("bad file error is friendly and the sample recovers", async ({ page }) => {
  await page.goto("/#analyze")
  await page.locator('input[type="file"]').setInputFiles({
    name: "flows.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not a flow file"),
  })

  await expect(page.getByRole("alert")).toContainText("Choose a .csv, .txt, or .tsv file.")
  await page.getByRole("button", { name: "Try a sample file" }).click()
  await expect(page.getByRole("heading", { name: "Analysis results" })).toBeVisible()
})

test("theme toggle keeps Analyze text at readable contrast", async ({ page }) => {
  await page.goto("/#analyze")
  const toggle = page.getByRole("button", { name: "Switch to dark theme" })
  await toggle.click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")

  const darkContrast = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const parse = (value: string) => value.match(/\w\w/g)!.slice(-3).map((part) => parseInt(part, 16) / 255)
    const luminance = (color: string) =>
      parse(color).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
    const text = luminance(root.getPropertyValue("--text").trim())
    const background = luminance(root.getPropertyValue("--bg").trim())
    return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05)
  })
  expect(darkContrast).toBeGreaterThanOrEqual(4.5)
  await expect(page.getByRole("heading", { name: "Analyze", exact: true })).toBeVisible()
})

test("mobile results keep the page fixed-width and table scrollable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/#analyze")
  await page.getByRole("button", { name: "Try a sample file" }).click()
  await expect(page.getByRole("heading", { name: "Scored flows" })).toBeVisible()

  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }))
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
  const tableContainer = page.locator('section[aria-labelledby="results-heading"] .overflow-x-auto')
  const tableDimensions = await tableContainer.evaluate((element) => ({
    contentWidth: element.scrollWidth,
    containerWidth: element.clientWidth,
  }))
  expect(tableDimensions.contentWidth).toBeGreaterThan(tableDimensions.containerWidth)
})
