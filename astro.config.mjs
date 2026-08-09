// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from "@tailwindcss/vite";
import icon from 'astro-icon';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkDirective from 'remark-directive';
import rehypeComponents from "rehype-components";

import { AdmonitionComponent } from "./src/plugins/rehype-component-admonition.mjs";
import { parseDirectiveNode } from "./src/plugins/remark-directive-rehype.mjs";
import { MusicCardComponent } from "./src/plugins/rehype-component-music-card.mjs";
import { GithubCardComponent } from './src/plugins/rehype-component-github-card.mjs';
import { QuoteComponent } from "./src/plugins/rehype-component-quote.mjs"
import { DerivationComponent } from './src/plugins/rehype-component-derivation.mjs';
import { customFigurePlugin } from "./src/plugins/rehype-figure-plugin.mjs";
import { remarkCombined } from './src/plugins/remark-combined.mjs';
import { remarkTypst } from './src/plugins/remark-typst.mjs';
import { remarkAutoMath } from './src/plugins/remark-auto-math.mjs';
import { remarkNormalizeLinks } from './src/plugins/remark-normalize-links.mjs';



// https://astro.build/config
export default defineConfig({
  site: 'https://shi-tou1234.github.io',
  base: '/cmchen-blog-starter/',
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp'
    }
  },
  integrations: [icon({
    include: {
      "fa6-brands": ["creative-commons", "github"],
      "fa6-solid": ["align-justify", "arrow-left", "arrow-right", "arrow-up", "box-open", "calculator", "circle", "circle-question", "envelope", "file-lines", "globe", "link", "magnifying-glass", "table", "text-height"],
      "material-symbols": ["dark-mode-outline-rounded", "radio-button-partial-outline", "wb-sunny-outline-rounded"],
      "simple-icons": ["astro", "github", "gitee", "tailwindcss"]
    }
  })],
  markdown: {
    shikiConfig: {
      theme: 'one-dark-pro', // code theme
      wrap: false
    },
    remarkPlugins: [
      remarkMath,
      remarkNormalizeLinks,
      remarkAutoMath,
      remarkDirective,
      remarkTypst,
      parseDirectiveNode,
      remarkCombined
    ],
    rehypePlugins: [
      rehypeKatex,
      customFigurePlugin,
      [
        rehypeComponents,
        {
          components: {
            github: GithubCardComponent,
            music: MusicCardComponent,
            quote: QuoteComponent,
            derivation: DerivationComponent,
            note: (x, y) => AdmonitionComponent(x, y, "note"),
            tip: (x, y) => AdmonitionComponent(x, y, "tip"),
            important: (x, y) => AdmonitionComponent(x, y, "important"),
            caution: (x, y) => AdmonitionComponent(x, y, "caution"),
            warning: (x, y) => AdmonitionComponent(x, y, "warning"),
          },
        },
      ],
    ]
  },
  vite: {
    plugins: [tailwindcss()]
  }
});