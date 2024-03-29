# unplugin-auto-import

由Anthony Fu大佬开源的一个自动导入的插件，非常的好用，来学习一下内部实现。

本篇以`examples`目录下的`vite-react`项目为例。

## 起步
入口文件位于`src/core/unplugin.ts`

```typescript
export default createUnplugin<Options>((options) => {
  let ctx = createContext(options)
  return {
    name: 'unplugin-auto-import',
    enforce: 'post',
    transformInclude(id) {
      return ctx.filter(id)
    },
    async transform(code, id) {
      return ctx.transform(code, id)
    },
    async buildStart() {
      await ctx.scanDirs()
    },
    async buildEnd() {
      await ctx.writeConfigFiles()
    },
    vite: {
      async handleHotUpdate({ file }) {
        if (ctx.dirs?.some(glob => minimatch(slash(file), slash(glob))))
          await ctx.scanDirs()
      },
      async configResolved(config) {
        if (ctx.root !== config.root) {
          ctx = createContext(options, config.root)
          await ctx.scanDirs()
        }
      },
    },
  }
})
```

文件内默认导出了`unplugin`内的`createUnplugin`创建的统一`bundle`框架的插件，先是调用了`createContext`创建了插件的上下文后返回了插件的生命周期对应执行的逻辑。


## createContext

```typescript
export function createContext(options: Options = {}, root = process.cwd()) {
  const {
    dts: preferDTS = isPackageExists('typescript'),
  } = options

  const dirs = options.dirs?.map(dir => resolve(root, dir))

  const eslintrc: ESLintrc = options.eslintrc || {}
  eslintrc.enabled = eslintrc.enabled === undefined ? false : eslintrc.enabled
  eslintrc.filepath = eslintrc.filepath || './.eslintrc-auto-import.json'
  eslintrc.globalsPropValue = eslintrc.globalsPropValue === undefined ? true : eslintrc.globalsPropValue

  const resolvers = options.resolvers ? [options.resolvers].flat(2) : []

  // When "options.injectAtEnd" is undefined or true, it's true.
  const injectAtEnd = options.injectAtEnd !== false

  const unimport = createUnimport({
    imports: [],
    presets: [],
    injectAtEnd,
    addons: [
      ...(options.vueTemplate ? [vueTemplateAddon()] : []),
      resolversAddon(resolvers),
      {
        declaration(dts) {
          return `${`
/* eslint-disable */
/* prettier-ignore */
// @ts-nocheck
// noinspection JSUnusedGlobalSymbols
// Generated by unplugin-auto-import
${dts}`.trim()}\n`
        },
      },
    ],
  })

  /**
   * ...
   */

  return {
    root,
    dirs,
    filter,
    scanDirs,
    writeConfigFiles,
    writeConfigFilesThrottled,
    transform,
    generateDTS,
    generateESLint,
  }
}
```

函数内对插件传入的几个配置项参数进行初始化，其他则是一些方法的声明，直接看可能不知道是什么意思，直到调用时再看就明白了。

1. 是否需要生成`dts`文件，默认值会使用`local-pkg`这个库中的`isPackageExists`来判断是否有`typescript`这个依赖。
2. 将需要解析的每一个定义的路径进行完整拼接储存在`dirs`中。
3. 定义`eslintrc`相关配置，涉及是否生成`json`文件，生成的路径，文件内每个依赖的值。
4. 对传入的`resolver`项进行数组扁平化处理。
5. 定义`import`注入的顺序，默认为注入到其它`import`的尾部。

---

**分析自动导入的依赖关系**的第一步是**分析其导出关系**，所以先从**分析导出关系**开始。

插件在`buildStart`和`handleHotUpdate`以及`configResolved`都会对目录进行扫描，后两者是`vite`专属的一个`Hooks`。

根据`vite`文档得知，这个`Hook`用于解析`vite`的整个配置，因此`configResolved`将是**第一个**被调用用于分析的方法。

### configResolved()

```typescript
async function configResolved(config) {
  if (ctx.root !== config.root) {
    ctx = createContext(options, config.root)
    await ctx.scanDirs()
  }
}
```

判断`createContext`定义的根目录是否与vite配置的根目录相同，若有不同则使用vite提供的根目录路径再一次创建上下文后对其覆盖。
