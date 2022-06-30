const { defaultTheme } = require('@vuepress/theme-default');
const sidebar = require('./config/sidebar');
const navbar = require('./config/navbar');

module.exports = {
  lang: 'zh-CN',
  title: 'Cv-Engineer123',
  head: [['link', { rel: 'icon', href: './image/logo.png' }]],
  theme: defaultTheme({
    sidebar,
    navbar,
    logo: './image/logo.png',
  }),
};
