# pdf.js踩坑分享(基于webpack下的pdfjs-dist库)

最近项目有预览pdf文件的一个需求，目前比较常用的pdf预览库是Mozilla基金会主导的pdf.js,
pdfjs-dist则是pdf.js的模块化实现，这里使用的版本为最新版本2.14.305，这几个比较新的版本带有typescript类型提示，用的更为方便一些

***

```
  npm i pdfjs-dist -S
```

安装完成后 在组件内导入

```javascript
  import { getDocument } from 'pdfjs-dist';
```

在组件中调用

```javascript
  getDocument('url地址');
```

保存后查看效果，这时候出现了一个报错

```
Module parse failed: Unexpected character '#' (1387:9)
You may need an appropriate loader to handle this file type, currently no loaders are configured to process this file. See https://webpack.js.org/concepts#loaders
| 
| class PDFDocumentLoadingTask {
>   static #docId = 0;
| 
|   constructor() {

```

由报错箭头指示可知，webpack无法识别并构建ECMA的新特性（private符号），而这个库的作者竟然不愿意用babel转化
一遍直接就丢了出来让用户自己解决。因此需要手动为其配置一遍babel

由于我的开发环境是基于Vue-cli3的环境下搭建，因此在vue.config.js中配置，正常webpack环境下则配置webpack.config.js

```javascript
  chainWebpack: (config) => {
    config.module
      .rule('pdfjs')
      .test(/pdf.js/)
      .use('babel-loader')
      .loader('babel-loader')
      .end();
  }
```

配置vue.config.js中的chainWebpack属性进行链式调用,将pdf.js文件使用babel-loader进行转化,这里的test我直接使用了文件名精准匹配，
也可以自己以其他方式填写规则，保存后重新启动就可以正常使用了
