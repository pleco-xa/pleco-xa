// Mirror the tracked documentation content from the repo-root `/docs` directory
// into this Astro site's Starlight content collection at
//   apps/docs/src/content/docs/
// so Starlight (which is hard-wired to load `docsLoader()` from
// `src/content/docs/`) builds from it.
//
// `/docs` is the single TRACKED source of hand-written documentation, browsable
// directly on GitHub. The copy landed here is a BUILD ARTIFACT — the whole
// `src/content/docs/` directory is gitignored. The TypeDoc-generated API
// reference (`src/content/docs/api/`) is emitted later, during `astro build`,
// by the starlight-typedoc plugin; it is not part of `/docs`, so this mirror
// intentionally does not manage it beyond the clean-slate wipe below (the API
// is regenerated on every build).
//
// Zero dependencies — Node built-ins only. Runs from the `predev`/`prebuild`
// hooks in apps/docs/package.json, BEFORE astro starts.

import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url)) // apps/docs/scripts
const docsRoot = resolve(here, '..') // apps/docs
const repoRoot = resolve(here, '..', '..', '..') // monorepo root

const source = resolve(repoRoot, 'docs') // tracked hand-written content
const dest = resolve(docsRoot, 'src', 'content', 'docs') // Starlight content collection

if (!existsSync(source)) {
  console.error(`[mirror-docs] missing source: ${source}`)
  process.exit(1)
}

// Clean slate: wipe the mirror (including any previously generated `api/`, which
// astro build regenerates) so removed/renamed source files never linger.
rmSync(dest, { recursive: true, force: true })
mkdirSync(dirname(dest), { recursive: true })
cpSync(source, dest, { recursive: true })

console.log(`[mirror-docs] docs/ -> ${dest.replace(`${repoRoot}/`, '')}`)
