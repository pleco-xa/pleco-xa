import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import { createStarlightTypeDocPlugin } from 'starlight-typedoc'

const [starlightTypeDoc, typeDocSidebarGroup] = createStarlightTypeDocPlugin()

export default defineConfig({
  site: 'https://plecoxa.com',
  integrations: [
    starlight({
      title: 'Pleco-Xa',
      description: 'Browser-native audio analysis engine — musical timing, spectral features, and intelligent loop detection.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/brookcs3/pleco-xa' }],
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
