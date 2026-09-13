// QA screenshots of every page at iPhone and desktop sizes, using a local Chromium.
// Signs in with QA_EMAIL/QA_PASSWORD (creates the account if sign-up is open).
//   bun run shots   -> writes ./shots/*.png (gitignored)
import { mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.env.SHOTS_BASE ?? 'https://avo.localhost'
const EMAIL = process.env.QA_EMAIL ?? 'qa@avo.local'
const PASSWORD = process.env.QA_PASSWORD ?? 'qa-password-123'
const BROWSER =
  process.env.SHOTS_BROWSER ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--ignore-certificate-errors', '--no-first-run', '--disable-brave-update'],
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.error('pageerror', e instanceof Error ? e.message : String(e)))
page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()))

async function auth(path: string, body: object) {
  return page.evaluate(
    async (p, b) => {
      const r = await fetch(p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      })
      return r.status
    },
    path,
    body,
  )
}

await page.goto(`${BASE}/login?mode=signin`, { waitUntil: 'load' })
let status = await auth('/api/auth/sign-in/email', { email: EMAIL, password: PASSWORD })
if (status === 401) {
  status = await auth('/api/auth/sign-up/email', { email: EMAIL, password: PASSWORD, name: 'QA' })
}
console.log('auth status', status)

// Switch the sidebar profile switcher to a profile by name (desktop layout).
async function switchProfile(name: string) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await new Promise((r) => setTimeout(r, 1200))
  await page.click('[data-sidebar="menu-button"][data-size="lg"]')
  await new Promise((r) => setTimeout(r, 400))
  const idx = await page.$$eval(
    '[role="menuitem"]',
    (els, n) => els.findIndex((el) => el.textContent?.trim().startsWith(n)),
    name,
  )
  if (idx >= 0) {
    await (await page.$$('[role="menuitem"]'))[idx].click()
    await new Promise((r) => setTimeout(r, 1200))
  } else {
    await page.keyboard.press('Escape')
  }
}

// Work in the Joint profile, which holds the real data.
await switchProfile('Joint')

const pages = [
  ['login', '/login?mode=signin'],
  ['overview', '/'],
  ['transactions', '/transactions'],
  ['banks', '/connect'],
  ['categorize', '/categorize'],
  ['not-found', '/nope'],
] as const

for (const [width, height, tag, mobile, scheme] of [
  [390, 844, 'iphone', true, 'light'],
  [390, 844, 'iphone-dark', true, 'dark'],
  [1440, 900, 'desktop', false, 'light'],
] as const) {
  await page.setViewport({
    width,
    height,
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
  })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
  for (const [name, path] of pages) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' })
    await new Promise((r) => setTimeout(r, 1200))
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png` })
    console.log(`${tag}-${name}.png`)
  }
}
// Interaction states on iPhone: open range picker, and hold the hero chart.
await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
await page.goto(`${BASE}/transactions`, { waitUntil: 'load' })
await new Promise((r) => setTimeout(r, 1200))
await page.click('button:has(svg.lucide-calendar)')
await new Promise((r) => setTimeout(r, 600))
await page.screenshot({ path: `${OUT}/iphone-datepicker.png` })
console.log('iphone-datepicker.png')

await page.goto(`${BASE}/`, { waitUntil: 'load' })
await new Promise((r) => setTimeout(r, 1500))
const chart = await page.$('.cursor-crosshair')
const box = await chart?.boundingBox()
if (box) {
  await page.touchscreen.touchStart(box.x + box.width * 0.35, box.y + box.height / 2)
  await new Promise((r) => setTimeout(r, 300))
  await page.screenshot({ path: `${OUT}/iphone-scrub.png` })
  await page.touchscreen.touchEnd()
  console.log('iphone-scrub.png')
}
// Desktop: profile switcher open, then create a profile end-to-end.
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await new Promise((r) => setTimeout(r, 1200))
await page.click('[data-sidebar="menu-button"][data-size="lg"]')
await new Promise((r) => setTimeout(r, 500))
await page.screenshot({ path: `${OUT}/desktop-switcher.png` })
console.log('desktop-switcher.png')
const newItem = await page.$$eval('[role="menuitem"]', (els) =>
  els.findIndex((el) => el.textContent?.includes('New profile')),
)
if (newItem >= 0) {
  const items = await page.$$('[role="menuitem"]')
  await items[newItem].click()
  await new Promise((r) => setTimeout(r, 500))
  await page.type('#profile-name', `QA ${Date.now().toString().slice(-4)}`)
  await page.screenshot({ path: `${OUT}/desktop-new-profile.png` })
  console.log('desktop-new-profile.png')
  await page.keyboard.press('Enter')
  await new Promise((r) => setTimeout(r, 2000))
  await page.screenshot({ path: `${OUT}/desktop-after-create.png` })
  console.log('desktop-after-create.png')
}
// Rename the first connected account (back in Joint, which has accounts).
await switchProfile('Joint')
await page.goto(`${BASE}/connect`, { waitUntil: 'load' })
await new Promise((r) => setTimeout(r, 1200))
const renameButton = await page.$('button[aria-label="Rename account"]')
if (renameButton) {
  await renameButton.click()
  await new Promise((r) => setTimeout(r, 400))
  await page.screenshot({ path: `${OUT}/desktop-rename.png` })
  await page.keyboard.press('Escape')
  console.log('desktop-rename.png')
} else {
  console.log('no connected account to rename; skipped')
}
await browser.close()
