const { defaultTheme } = require('@vuepress/theme-default');
const sidebar = require('./config/sidebar');
const navbar = require('./config/navbar');

module.exports = {
  lang: 'zh-CN',
  title: '愿天下没有Bug',
  theme: defaultTheme({
    // 侧边栏对象
    // 不同子路径下的页面会使用不同的侧边栏
    sidebar,
    navbar,
  }),
};
