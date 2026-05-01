/**
 * One-shot manifest slimifier.
 *
 * Rewrites public/data/manhattan/manifest.json and roads_manifest.json from
 * the verbose `[{ id, file, bounds: {minX, maxX, minZ, maxZ}, *Count }, ...]`
 * shape into a compact `[[gridX, gridZ], ...]` shape. The runtime inflates
 * back to the verbose shape on load (see src/lib/manifests.js).
 *
 * Idempotent: detects already-slim manifests (tiles is an array of pairs) and
 * leaves them alone. Run after every data regen, or as a one-time migration:
 *
 *   node scripts/slim-manifests.mjs
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'manhattan')

const TILE_SIZE = 500

function isAlreadySlim(manifest) {
  return Array.isArray(manifest.tiles) && manifest.tiles.length > 0 && Array.isArray(manifest.tiles[0])
}

function gridFromBounds(bounds) {
  return [Math.round(bounds.minX / TILE_SIZE), Math.round(bounds.minZ / TILE_SIZE)]
}

function slimify(manifest) {
  if (isAlreadySlim(manifest)) return null
  const tiles = manifest.tiles.map((t) => {
    if (t.bounds) return gridFromBounds(t.bounds)
    if (typeof t.id === 'string') {
      const [gx, gz] = t.id.split('_').map(Number)
      return [gx, gz]
    }
    throw new Error(`unrecognised tile entry: ${JSON.stringify(t)}`)
  })
  return {
    v: 2,
    origin: manifest.origin,
    tileSize: manifest.tileSize ?? TILE_SIZE,
    tiles,
  }
}

async function processFile(file) {
  const full = path.join(DATA_DIR, file)
  let raw
  try {
    raw = await fs.readFile(full, 'utf8')
  } catch {
    console.log(`  ${file}: not found, skipping`)
    return
  }
  const manifest = JSON.parse(raw)
  const slim = slimify(manifest)
  if (!slim) {
    console.log(`  ${file}: already slim (${manifest.tiles.length} tiles)`)
    return
  }
  const before = Buffer.byteLength(raw, 'utf8')
  const out = JSON.stringify(slim)
  const after = Buffer.byteLength(out, 'utf8')
  await fs.writeFile(full, out)
  const ratio = ((after / before) * 100).toFixed(1)
  console.log(`  ${file}: ${before} → ${after} bytes (${ratio}%)  ${slim.tiles.length} tiles`)
}

async function main() {
  console.log(`Slimifying manifests in ${DATA_DIR}…`)
  await processFile('manifest.json')
  await processFile('roads_manifest.json')
  console.log('Done.')
}

main().catch((err) => { console.error(err); process.exit(1) })
