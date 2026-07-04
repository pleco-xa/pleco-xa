// Copy the live example demos, the built pleco-xa bundle, and the demo audio
// corpus into the docs site's public/ folder so the gallery can iframe them.
//
// Relative paths are preserved on purpose: a demo served at
//   /demos/<name>.html
// imports  ../../packages/pleco-xa/dist/pleco-xa.js  and fetches
//   ../../apps/demo/public/audio/<file>.wav
// Those `../../` URLs resolve (clamped at the site root) to
//   /packages/pleco-xa/dist/pleco-xa.js
//   /apps/demo/public/audio/<file>.wav
// which is exactly where the mirrors below land. No demo source is rewritten.
//
// Zero dependencies — Node built-ins only. Runs from the `predev`/`prebuild`
// hooks in apps/docs/package.json.

import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url)) // apps/docs/scripts
const docsRoot = resolve(here, '..') // apps/docs
const repoRoot = resolve(here, '..', '..', '..') // monorepo root
const publicDir = resolve(docsRoot, 'public')

/** Copy a whole directory tree, replacing any stale mirror first. */
function mirrorDir(fromRel, toRel) {
  const from = resolve(repoRoot, fromRel)
  const to = resolve(publicDir, toRel)
  if (!existsSync(from)) {
    console.warn(`[copy-demos] skip (missing source): ${fromRel}`)
    return
  }
  rmSync(to, { recursive: true, force: true })
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
  console.log(`[copy-demos] ${fromRel} -> public/${toRel}`)
}

/** Copy a single file, creating parent dirs as needed. */
function mirrorFile(fromRel, toRel) {
  const from = resolve(repoRoot, fromRel)
  const to = resolve(publicDir, toRel)
  if (!existsSync(from)) {
    console.warn(`[copy-demos] skip (missing source): ${fromRel}`)
    return
  }
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to)
  console.log(`[copy-demos] ${fromRel} -> public/${toRel}`)
}

// 1. The example demos themselves (HTML + _badge.js + fixtures/).
mirrorDir('examples/web', 'demos')

// 2. The built library bundle the demos import.
mirrorDir('packages/pleco-xa/dist', 'packages/pleco-xa/dist')

// 3. The demo audio corpus the demos fetch.
mirrorDir('apps/demo/public/audio', 'apps/demo/public/audio')

// 4. Golden-loop fixture consumed by the loop-detect flagship demo.
mirrorFile(
  'tools/goldens/loop_goldens.json',
  'tools/goldens/loop_goldens.json',
)

console.log('[copy-demos] done')
