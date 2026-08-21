import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { guideLinks, headingAnchors } from './src/lib/markdown-plugins.mjs';

const BASE = '/lwf-modding';

export default defineConfig({
  site: 'https://meowous3.github.io',
  base: BASE,
  markdown: {
    processor: satteri({ hastPlugins: [guideLinks(BASE), headingAnchors()] }),
    shikiConfig: {
      themes: { light: 'min-light', dark: 'monokai' },
      defaultColor: false,
    },
  },
});
