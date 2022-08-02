import sidebar from "./config/sidebar";
import navbar from "./config/navbar";
import {defineConfig} from "vitepress";

export default defineConfig({
  lang: 'zh-CN',
  title: 'Cv-Engineer123',
  head: [['link', {rel: 'icon', type: 'image/svg+xml', href: '/logo.svg'}]],
  themeConfig: {
    logo: '/logo.svg',
    sidebar,
    nav: navbar,
    lastUpdatedText: 'Updated Date'
  },
})
