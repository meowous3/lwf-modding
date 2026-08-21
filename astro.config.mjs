import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://meowous3.github.io',
  base: '/lwf-modding',
  markdown: {
    shikiConfig: {
      themes: { light: 'min-light', dark: 'monokai' },
      defaultColor: false,
    },
  },
});
