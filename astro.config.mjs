import { defineConfig, fontProviders } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import {
  guideLinks,
  headingAnchors,
  mediaPaths,
  tabGroups,
  tabsDirective,
} from './src/lib/markdown-plugins.mjs';

const BASE = '/lwf-modding';

export default defineConfig({
  site: 'https://meowous3.github.io',
  base: BASE,
  fonts: [
    {
      name: 'Fraunces',
      cssVariable: '--font-display',
      provider: fontProviders.google(),
      weights: [700, 900],
    },
    {
      name: 'Nunito Sans',
      cssVariable: '--font-ui',
      provider: fontProviders.google(),
      weights: [400, 600, 800],
    },
  ],
  markdown: {
    processor: satteri({
      // `:::tabs` is a container directive, off by default in Sätteri.
      features: { directive: true },
      mdastPlugins: [tabsDirective()],
      // `tabGroups` runs after Astro's highlighter, so the fences inside a
      // pane are already highlighted <pre> trees when it rebuilds the group.
      hastPlugins: [guideLinks(BASE), mediaPaths(BASE), tabGroups(), headingAnchors()],
    }),
    shikiConfig: {
      // Both keys are dark themes on purpose: a code block is a panel, and panels
      // in this design are dark in every colour scheme. See task-6-report.md.
      themes: { light: 'monokai', dark: 'gruvbox-dark-medium' },
      defaultColor: false,
    },
  },
});
