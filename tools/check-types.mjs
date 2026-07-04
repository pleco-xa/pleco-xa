#!/usr/bin/env node
/**
 * check-types — the honest type gate for shipped declarations.
 *
 * Declaration EMISSION stays tolerant by design (JSDoc inference errors are
 * non-fatal during `npm run build`), but what we SHIP must parse and
 * type-check for a real consumer. This gate:
 *
 *   1. `npm pack`s packages/pleco-xa — exactly the file set npm publish ships,
 *   2. installs the tarball into a throwaway project under the OS temp dir,
 *   3. type-checks tools/type-fixture/consumer.ts against the installed
 *      package with skipLibCheck: false, under BOTH
 *      moduleResolution=bundler and moduleResolution=node16,
 *   4. exits non-zero with the full tsc diagnostics if either leg fails.
 *
 * Requires a prior library build (dist/ must exist): `npm run build:lib`.
 * Paths are resolved relative to this file, so it runs from anywhere.
 */
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const pkgDir = path.join(repoRoot, 'packages', 'pleco-xa')
const fixture = path.join(here, 'type-fixture', 'consumer.ts')

function fail(message) {
  console.error(`check-types: FAIL — ${message}`)
  process.exit(1)
}

if (!existsSync(path.join(pkgDir, 'dist', 'types', 'index.d.ts'))) {
  fail(
    'packages/pleco-xa/dist/types/index.d.ts is missing — run `npm run build:lib` first.',
  )
}

// Resolve the workspace TypeScript compiler (devDependency of pleco-xa).
const requireFromPkg = createRequire(path.join(pkgDir, 'package.json'))
let tscBin
try {
  tscBin = requireFromPkg.resolve('typescript/bin/tsc')
} catch {
  fail('typescript is not installed — run `npm ci` first.')
}

const work = mkdtempSync(path.join(tmpdir(), 'pleco-xa-type-gate-'))
let failed = false
try {
  // 1. Pack exactly what `npm publish` would ship.
  const packJson = execFileSync(
    'npm',
    ['pack', '--json', '--pack-destination', work],
    { cwd: pkgDir, encoding: 'utf8' },
  )
  const tarball = path.join(work, JSON.parse(packJson)[0].filename)

  // 2. Throwaway consumer project.
  const proj = path.join(work, 'consumer')
  mkdirSync(proj)
  writeFileSync(
    path.join(proj, 'package.json'),
    JSON.stringify(
      { name: 'pleco-xa-type-fixture', private: true, type: 'module' },
      null,
      2,
    ),
  )
  copyFileSync(fixture, path.join(proj, 'consumer.ts'))
  execFileSync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--no-save', '--silent', tarball],
    { cwd: proj, stdio: ['ignore', 'inherit', 'inherit'] },
  )

  // 3. Both resolution modes a consumer realistically uses.
  const modes = [
    { name: 'bundler', module: 'esnext', moduleResolution: 'bundler' },
    { name: 'node16', module: 'node16', moduleResolution: 'node16' },
  ]
  for (const mode of modes) {
    const cfgPath = path.join(proj, `tsconfig.${mode.name}.json`)
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          compilerOptions: {
            noEmit: true,
            strict: true,
            skipLibCheck: false,
            target: 'es2020',
            lib: ['ES2020', 'DOM'],
            module: mode.module,
            moduleResolution: mode.moduleResolution,
            types: [],
          },
          files: ['consumer.ts'],
        },
        null,
        2,
      ),
    )
    try {
      execFileSync(process.execPath, [tscBin, '-p', cfgPath], {
        cwd: proj,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      console.log(`check-types: ${mode.name.padEnd(7)} — OK`)
    } catch (err) {
      failed = true
      console.error(`check-types: ${mode.name.padEnd(7)} — FAILED`)
      if (err.stdout) console.error(String(err.stdout))
      if (err.stderr) console.error(String(err.stderr))
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

if (failed) {
  fail(
    'shipped type declarations do not type-check for consumers ' +
      '(see tsc diagnostics above).',
  )
}
console.log(
  'check-types: PASS — packed .d.ts type-check clean under bundler and node16 (skipLibCheck: false).',
)
