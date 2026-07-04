// TypeScript-style extension resolution for plain-JS importers.
//
// WHY THIS EXISTS (type-gate fix, 2026-07-04): the shipped dist/types/*.d.ts
// must never contain '.ts' import specifiers — a consumer's tsc cannot
// resolve them, which made `import 'pleco-xa'` fail type-checking. So the
// library source imports its few TypeScript modules with '.js' specifiers
// (e.g. './scripts/analysis/AudioPlayer.js'), exactly the mapping tsc
// performs natively. Rollup and Vite do NOT apply that mapping when the
// importer is a .js file, hence this tiny resolveId shim: a relative './x.js'
// specifier resolves to './x.ts' when only the .ts source exists.
import { existsSync } from 'node:fs'
import path from 'node:path'

export function tsExtensionResolve() {
  return {
    name: 'ts-extension-resolve',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.') || !source.endsWith('.js')) {
        return null
      }
      const resolved = path.resolve(path.dirname(importer), source)
      if (existsSync(resolved)) {
        return null
      }
      const tsPath = `${resolved.slice(0, -3)}.ts`
      return existsSync(tsPath) ? tsPath : null
    },
  }
}
