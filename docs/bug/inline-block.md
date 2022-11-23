# display: inline-block的换行符/空格出现的间距在vue-cli中的表现

在使用element-ui内的select组件时，定义了两个相邻的select组件

```html
<el-select></el-select>
<el-select></el-select>
```

因为select设置了display:inline-block并且存在换行，使两个元素之前出现了间距，在webpack3下表现正常，而在vue-cli4下(基于webpack4)的表现是不一样的

::: tip 为何出现间距
元素被当成行内元素排版的时候，元素之间的空白符（空格、回车换行等）都会被浏览器处理，根据white-space的处理方式（默认是normal，合并多余空白），原来HTML代码中的回车换行被转成一个空白符，在字体不为0的情况下，空白符占据一定宽度，所以inline-block的元素之间就出现了空隙。
:::

## vue-loader

导致间距消失的原因有可能是编译时删除了其中的空白符/换行符，一开始我认为是webpack
的原因导致空白符/换行符消失，查阅了Google后没有任何有关的结果，后来想到.vue文件是由vue-loader来处理的，应该和vue-loader有关

https://vue-loader.vuejs.org/zh/#vue-loader-%E6%98%AF%E4%BB%80%E4%B9%88%EF%BC%9F

## vue-template-compiler

在查阅了vue-loader文档后，在选项参考处中找到了compilerOptions属性


> 模板编译器的选项。当使用默认的 vue-template-compiler 的时候，你可以使用这个选项来添加自定义编译器指令、模块或通过 {
> preserveWhitespace: false } 放弃模板标签之间的空格。
> 详情查阅 vue-template-compiler 选项参考

进入vue-template-compiler文档，找到了whitespace这个选项

::: warning 一定要进入英文原版的文档!!! 中文文档是旧版的
https://github.com/vuejs/vue/tree/dev/packages/vue-template-compiler#options
:::

看到默认值是preserve就比较奇怪，preserve就是需要的转化规则，为什么preserve会导致间距消失，由于vue-cli4是基于webpack的基础上做了一层封装，所以根本原因可能是vue-cli做了设置

## vue-cli

在cli-service/lib/config/base.js文件内找到了相关配置

```javascript
webpackConfig.module
    .rule('vue')
    .test(/\.vue$/)
    .use('cache-loader')
    .loader(require.resolve('cache-loader'))
    .options(vueLoaderCacheConfig)
    .end()
    .use('vue-loader')
    .loader(require.resolve('vue-loader'))
    .options(Object.assign({
        compilerOptions: {
            whitespace: 'condense'
        }
    }, vueLoaderCacheConfig))
```

原来是vue-cli将whitespace改成了condense，因此将选项需要改回去，在vue.config文件内配置

```javascript
// vue.config.js
module.exports = {
    chainWebpack: config => {
        // 修改方式不限，只要是改成preserve就可以
        config.module.rule('vue').use('vue-loader').tap(options => {
                options.compilerOptions.whitespace = 'preserve'
                return options
            }
        )
    }
}
```

重新启动后就正常了~
