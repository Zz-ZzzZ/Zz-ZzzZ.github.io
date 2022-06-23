const { defaultTheme } = require('@vuepress/theme-default');
const sidebar = require('./config/sidebar');
const navbar = require('./config/navbar');

module.exports = {
  lang: 'zh-CN',
  title: '愿天下没有Bug',
  theme: defaultTheme({
    sidebar,
    navbar,
    logo: './image/bug.png',
  }),
};
