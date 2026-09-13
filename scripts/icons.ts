// Rasterise the SVG app icons into the PNG sizes the manifest and iOS need. `bun run icons`
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const out = 'public/icons'
const jobs: Array<[string, string, number]> = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon.svg', 'apple-touch-icon.png', 180],
  ['maskable.svg', 'maskable-512.png', 512],
]
for (const [src, dest, size] of jobs) {
  const svg = readFileSync(`${out}/${src}`, 'utf8')
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(`${out}/${dest}`, png)
  console.log(`${dest} ${size}px ${png.length} bytes`)
}
