import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import { createStarlightTypeDocPlugin } from 'starlight-typedoc'

const [starlightTypeDoc, typeDocSidebarGroup] = createStarlightTypeDocPlugin()

export default defineConfig({
  site: 'https://plecoxa.com',
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
          sidebar: { label: 'API Reference', collapsed: false },
        }),
      ],
      sidebar: [
        { label: 'Getting Started', items: [{ autogenerate: { directory: 'start' } }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Gallery', items: [{ autogenerate: { directory: 'gallery' } }] },
        { label: 'API by category', link: '/api-by-category/' },
        typeDocSidebarGroup,
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
      ],
    }),
  ],
})
