import { afterAll, afterEach, beforeAll, beforeEach, expect, setDefaultTimeout, test } from "bun:test"
import path from "node:path"
import puppeteer, { type Browser, type Page } from "puppeteer-core"

// Real Chrome, real mouse presses, against the real SelectionBar mounted on a plain page.
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const DIST = path.join(import.meta.dir, "harness", "dist")
const TEXT = "Short first hop. Your phone connects to the nearest Cloudflare city."

setDefaultTimeout(20_000)

let browser: Browser
let page: Page
let server: ReturnType<typeof Bun.serve>

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const pathname = new URL(request.url).pathname
      const file = Bun.file(path.join(DIST, pathname === "/" ? "index.html" : pathname))
      return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 })
    },
  })
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
})

afterAll(async () => {
  await browser?.close()
  server?.stop(true)
})

beforeEach(async () => {
  page = await browser.newPage()
  await page.goto(server.url.href)
  await page.waitForFunction(() => Array.isArray(window.sent))
})

async function selectTarget() {
  await page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.getElementById("target")!)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.waitForSelector(".notepad-selection button", { visible: true })
}

// A human press: the button stays down for a moment, as a finger on a trackpad does.
async function press(label: string) {
  const buttons = await page.$$(".notepad-selection button")
  for (const button of buttons) {
    if ((await button.evaluate((el) => el.textContent)) !== label) continue
    const box = (await button.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await Bun.sleep(150)
    await page.mouse.up()
    await Bun.sleep(100)
    return
  }
  throw new Error(`No button labelled ${label}`)
}

afterEach(async () => {
  await page?.close()
})

const sent = () => page.evaluate(() => window.sent)

test("one press of Add to notes sends the selection on a quiet page", async () => {
  await selectTarget()
  await press("Add to notes")
  expect(await sent()).toEqual([`notes:${TEXT}`])
})

test("one press of Add to notes sends the selection while the chat streams", async () => {
  await page.evaluate(() => window.startStream())
  await Bun.sleep(400)
  await selectTarget()
  await Bun.sleep(300)
  await press("Add to notes")
  await page.evaluate(() => window.stopStream())
  expect(await sent()).toEqual([`notes:${TEXT}`])
})

test("each button sends its own action once while the chat streams", async () => {
  await page.evaluate(() => window.startStream())
  await Bun.sleep(400)
  for (const label of ["Quote", "Add to list", "Add to notes"]) {
    await selectTarget()
    await press(label)
  }
  await page.evaluate(() => window.stopStream())
  expect(await sent()).toEqual([`quote:${TEXT}`, `list:${TEXT}`, `notes:${TEXT}`])
})

test("the bar stays up while the chat streams", async () => {
  await page.evaluate(() => window.startStream())
  await Bun.sleep(400)
  await selectTarget()
  await Bun.sleep(600)
  const visible = await page.$eval(".notepad-selection", (el) => el.getBoundingClientRect().height > 0).catch(() => false)
  await page.evaluate(() => window.stopStream())
  expect(visible).toBe(true)
})

test("the bar hides after an action", async () => {
  await selectTarget()
  await press("Add to list")
  expect(await page.$(".notepad-selection")).toBeNull()
})
