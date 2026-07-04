// Rewrite relative `.md`/`.mdx` links into the routes Starlight builds for them.
//
// `/docs` is authored with GitHub-style relative links (`./loop.md`,
// `../start/install.md#cdn`) so the tracked content browses correctly on
// GitHub. Astro does not resolve those at build time — verified against the
// installed astro@7.0.6: the `markdown` config schema carries only syntax
// highlighting + plugin arrays, and the experimental flags are
// clientPrerender / contentIntellisense / chromeDevtoolsWorkspace /
// svgOptimizer. Starlight ships no rewrite either. So this zero-dependency
// remark plugin (Node built-ins only) maps each relative markdown link to the
// route Starlight generates for the target file:
//
//   1. resolve the link against the current file's location under the content
//      root (`src/content/docs/` — the mirror of `/docs`; the vfile path
//      reflects the mirrored location, see scripts/mirror-docs.mjs)
//   2. strip the `.md`/`.mdx` extension
//   3. collapse `index` files to their directory route
//   4. lowercase the slug (Starlight lowercases every slug)
//   5. preserve any `#fragment`
//
// Absolute URLs (`https:`, `mailto:`, …), root-relative paths (`/api/…`),
// bare anchors (`#cdn`), and links to non-markdown targets pass through
// untouched. Runs for `.mdx` too: Starlight's MDX integration extends the
// project markdown config by default.

import { posix } from 'node:path'

const CONTENT_ROOT_MARKER = '/src/content/docs/'
const MD_EXTENSION = /\.mdx?$/i
const HAS_PROTOCOL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

/**
 * Map one link URL to its built route, or return `null` to leave it alone.
 *
 * @param {string} url - the raw link target from the mdast node
 * @param {string} dir - the current file's directory relative to the content
 *   root, POSIX-style (`'guides'`, `'start'`, `'.'` for root-level files)
 * @returns {string | null}
 */
export function mdLinkToRoute(url, dir) {
  if (typeof url !== 'string' || url === '') return null
  if (url.startsWith('#') || url.startsWith('/') || HAS_PROTOCOL.test(url)) return null

  const hashIndex = url.indexOf('#')
  const target = hashIndex === -1 ? url : url.slice(0, hashIndex)
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex)
  if (!MD_EXTENSION.test(target)) return null

  const resolved = posix.normalize(posix.join('/', dir === '.' ? '' : dir, target))

  let route = resolved.replace(MD_EXTENSION, '')
  if (route === '/index' || route.endsWith('/index')) {
    route = route.slice(0, -'index'.length) // `/guides/index` -> `/guides/`
  }
  route = route.toLowerCase()
  if (!route.endsWith('/')) route += '/'

  return route + fragment
}

/** Depth-first walk; rewrites `link` and `definition` node URLs in place. */
function walk(node, dir) {
  if ((node.type === 'link' || node.type === 'definition') && typeof node.url === 'string') {
    const route = mdLinkToRoute(node.url, dir)
    if (route !== null) node.url = route
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, dir)
  }
}

export function remarkMdLinks() {
  return (tree, file) => {
    const filePath = String(file?.path ?? file?.history?.[0] ?? '')
    const normalized = filePath.split('\\').join('/')
    const markerIndex = normalized.lastIndexOf(CONTENT_ROOT_MARKER)
    if (markerIndex === -1) return // not a docs content file (or no path) — skip

    const dir = posix.dirname(normalized.slice(markerIndex + CONTENT_ROOT_MARKER.length))
    walk(tree, dir)
  }
}

export default remarkMdLinks
