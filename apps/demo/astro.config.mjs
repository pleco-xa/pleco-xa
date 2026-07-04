import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  site: 'https://plecoxa.com',
  scopedStyleStrategy: 'class',
  server: {
    host: true,
  },
  vite: {
    resolve: {
      alias: {
        '@/': `${path.resolve(__dirname, 'src')}/`
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use 'sass:math'; @use 'sass:map'; @use "@/styles/import" as *;`
        },
      },
    },
    build: {
      assetsInlineLimit: 0,
    },
  },
  adapter: node({ mode: 'standalone' }), 
  output: 'server',
  devToolbar: {
    enabled: false,
  },
});