const { defaultTheme } = require('@vuepress/theme-default')
const sidebar = require('./config/sidebar')

module.exports = {
  lang: 'zh-CN',
  title: '愿天下没有Bug',
  description: '这是我的第一个 VuePress 站点',
  theme: defaultTheme({
    // 侧边栏对象
    // 不同子路径下的页面会使用不同的侧边栏
    sidebar
  }),
}
