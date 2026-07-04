import { readFileSync } from 'node:fs'
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import { createStarlightTypeDocPlugin } from 'starlight-typedoc'
import { remarkMdLinks } from './src/remark-md-links.mjs'

const [starlightTypeDoc] = createStarlightTypeDocPlugin()

// Grouped "API Reference" sidebar, built from the curated category page.
//
// starlight-typedoc's auto-generated sidebar group renders a flat alphabetical
// list (127 functions + 9 classes) and silently drops the Namespaces group:
// its isGroupWithDirectory check expects namespaces under `api/namespaces/`
// but typedoc-plugin-markdown emits them under `api/pleco-xa/namespaces/`.
// No plugin/TypeDoc option fixes that, so the sidebar is hand-built here
// instead — parsed at config time from docs/api-by-category.md, the single
// tracked source of the grouping. Every `## Section` becomes a collapsed
// sub-group and every | [`name`](/api/...) | table row becomes a link item,
// so the sidebar can never drift from the category page. The generated API
// pages themselves are untouched; only the sidebar organization changes.
function apiReferenceSidebarGroup() {
  const markdown = readFileSync(new URL('../../docs/api-by-category.md', import.meta.url), 'utf8')

  const groups = []
  let current
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^## (.+)$/)
    if (heading) {
      current = { label: heading[1].trim(), collapsed: true, items: [] }
      groups.push(current)
      continue
    }
    // Accept both site-absolute (/api/...) and full-URL (https://plecoxa.com/api/...)
    // link forms — the category page uses full URLs so its links also work when
    // the markdown is read on GitHub; the sidebar wants site-absolute paths.
    const row = line.match(
      /^\| \[`([^`]+)`\]\((?:https:\/\/plecoxa\.com)?(\/api\/[^)\s]+)\) \|/,
    )
    if (row && current) {
      current.items.push({ label: row[1], link: row[2] })
    }
  }

  const emptyGroups = groups.filter((group) => group.items.length === 0)
  if (groups.length === 0 || emptyGroups.length > 0) {
    throw new Error(
      `[astro.config] docs/api-by-category.md parse failed — ${groups.length} groups, ` +
        `empty: ${emptyGroups.map((group) => group.label).join(', ') || 'none'}`,
    )
  }

  // Classes and variables are not part of the category page (it covers
  // functions); listed explicitly so they stay reachable from the sidebar.
  const classes = {
    label: 'Classes',
    collapsed: true,
    items: [
      { label: 'AudioPlayer', link: '/api/classes/audioplayer/' },
      { label: 'BeatTracker', link: '/api/classes/beattracker/' },
      { label: 'ChromaFormatter', link: '/api/classes/chromaformatter/' },
      { label: 'DJLoopAnalyzer', link: '/api/classes/djloopanalyzer/' },
      { label: 'GibClock', link: '/api/classes/gibclock/' },
      { label: 'LoopPlayer', link: '/api/classes/loopplayer/' },
      { label: 'NoteFormatter', link: '/api/classes/noteformatter/' },
      { label: 'RealtimeSpectrumAnalyzer', link: '/api/classes/realtimespectrumanalyzer/' },
      { label: 'TimeFormatter', link: '/api/classes/timeformatter/' },
      { label: 'feature.ParameterError', link: '/api/pleco-xa/namespaces/feature/classes/parametererror/' },
      { label: 'intervals.IntervalConstructor', link: '/api/pleco-xa/namespaces/intervals/classes/intervalconstructor/' },
      { label: 'loop.DynamicZeroCrossing', link: '/api/pleco-xa/namespaces/loop/classes/dynamiczerocrossing/' },
      { label: 'loop.LoopController', link: '/api/pleco-xa/namespaces/loop/classes/loopcontroller/' },
    ],
  }

  const variables = {
    label: 'Variables',
    collapsed: true,
    items: [
      { label: 'allPresets', link: '/api/variables/allpresets/' },
      { label: 'liveSpeedController', link: '/api/variables/livespeedcontroller/' },
      { label: 'RHYTHM_VOCAB', link: '/api/variables/rhythm_vocab/' },
    ],
  }

  // Namespace overview pages. These routes currently redirect to
  // /api-by-category/ (see `redirects` below) — they resolve either way.
  const namespaces = {
    label: 'Namespaces',
    collapsed: true,
    items: [
      'audioio', 'bpm', 'cluster', 'convert', 'decompose', 'effects',
      'feature', 'file', 'fileio', 'filters', 'intervals', 'linalg',
      'loop', 'notation', 'playback', 'recurrence', 'segment', 'sequence',
    ].map((name) => ({ label: name, link: `/api/pleco-xa/namespaces/${name}/readme/` })),
  }

  return {
    label: 'API Reference',
    collapsed: false,
    items: [{ label: 'Overview', link: '/api/readme/' }, ...groups, classes, variables, namespaces],
  }
}

export default defineConfig({
  site: 'https://plecoxa.com',
  // GitHub-style relative `.md`/`.mdx` links in /docs -> built Starlight
  // routes. See src/remark-md-links.mjs (astro@7.0.6 has no native option).
  markdown: {
    remarkPlugins: [remarkMdLinks],
  },
  redirects: {
    '/api': '/api/readme/',
    '/api/pleco-xa/namespaces/audioio/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/bpm/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/cluster/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/convert/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/decompose/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/effects/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/feature/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/file/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/fileio/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/filters/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/intervals/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/linalg/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/loop/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/notation/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/playback/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/recurrence/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/segment/readme': '/api-by-category/',
    '/api/pleco-xa/namespaces/sequence/readme': '/api-by-category/',
  },
  integrations: [
    starlight({
      title: 'Pleco-Xa',
      description: 'Browser-native audio analysis engine — musical timing, spectral features, and intelligent loop detection.',
      favicon: '/favicon.png',
      head: [
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://plecoxa.com/brand/banner-dark.jpg' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://plecoxa.com/brand/banner-dark.jpg' } },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/pleco-xa/pleco-xa' }],
      plugins: [
        starlightTypeDoc({
          entryPoints: ['../../packages/pleco-xa/src/index.js'],
          tsconfig: './tsconfig.json',
          typeDoc: {
            plugin: ['typedoc-plugin-markdown'],
            skipErrorChecking: true,
            excludeInternal: true,
          },
          output: 'api',
        }),
      ],
      sidebar: [
        { label: 'Getting Started', items: [{ autogenerate: { directory: 'start' } }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Gallery', items: [{ autogenerate: { directory: 'gallery' } }] },
        { label: 'API by category', link: '/api-by-category/' },
        apiReferenceSidebarGroup(),
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
      ],
    }),
  ],
})
