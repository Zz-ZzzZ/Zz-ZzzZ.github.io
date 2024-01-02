# vue-demi源码阅读笔记

在统一封装`Hooks`库时有用到`vue-demi`这个库，其实现方式比较有趣，同时也才知道`npm script`也是有生命周期的。
`vue-demi`的作用就是作为一个枢纽，所有需要的`api`都从这里导入，而枢纽会通过项目内的`Vue`版本来写入对应的文件使得从`vue-demi`导入时实际就是从`vue`中导入，
这样在编写兼容库时就不需要大量的`if`版本判断。

## npm script - postinstall

`npm script` 是 `package.json` 中定义的一组内置脚本和自定义脚本。他们的目标是提供一种简单的方法来执行重复的任务，比如：启动项目、打包项目等。

:::info script
```json
{
  "scripts":{
    "postinstall": "node ./scripts/postinstall.js"
  }
}
```
:::

在`npm script`中，有一部分内置`script`，在`npm`执行不同的命令时触发对应的`script`，形成生命周期。

`postinstall`则是内置`script`中的一员，它在`npm install`后触发，`vue-demi`则在此阶段进行操作。

## postinstall.js

```javascript
const { switchVersion, loadModule } = require('./utils')

const Vue = loadModule('vue')

if (!Vue || typeof Vue.version !== 'string') {
  console.warn('[vue-demi] Vue is not found. Please run "npm install vue" to install.')
}
else if (Vue.version.startsWith('2.7.')) {
  switchVersion(2.7)
}
else if (Vue.version.startsWith('2.')) {
  switchVersion(2)
}
else if (Vue.version.startsWith('3.')) {
  switchVersion(3)
}
else {
  console.warn(`[vue-demi] Vue version v${Vue.version} is not suppported.`)
}

// 实际就是 return require('vue')
function loadModule(name) {
    try {
        return require(name)
    } catch (e) {
        return undefined
    }
}

function switchVersion(version, vue) {
    copy('index.cjs', version, vue)
    copy('index.mjs', version, vue)
    copy('index.d.ts', version, vue)

    if (version === 2)
        updateVue2API()
}
```

读取`Vue`的`version`，根据`Vue`实例内的`version`属性来判断当前运行版本来分别写入对应的文件。

```javascript
function updateVue2API() {
  const ignoreList = ['version', 'default']
  const VCA = loadModule('@vue/composition-api')
  if (!VCA) {
    console.warn('[vue-demi] Composition API plugin is not found. Please run "npm install @vue/composition-api" to install.')
    return
  }

  const exports = Object.keys(VCA).filter(i => !ignoreList.includes(i))

  const esmPath = path.join(dir, 'index.mjs')
  let content = fs.readFileSync(esmPath, 'utf-8')

  content = content.replace(
    /\/\*\*VCA-EXPORTS\*\*\/[\s\S]+\/\*\*VCA-EXPORTS\*\*\//m,
`/**VCA-EXPORTS**/
export { ${exports.join(', ')} } from '@vue/composition-api/dist/vue-composition-api.mjs'
/**VCA-EXPORTS**/`
    )

  fs.writeFileSync(esmPath, content, 'utf-8')
  
}
```

在`Vue2.6`及以下的版本使用`composition-api`语法时需要搭配`@vue/composition-api`插件，同时过滤掉了`@vue/composition-api`内的`default`、`version`属性。

避免覆盖原`Vue`示例下的对应属性，如果使用

```javascript
export * from '@vue/composition-api/dist/vue-composition-api.mjs'
```

则使用version时导入的是`@vue/composition-api`内的version，会有冲突[https://github.com/vueuse/vue-demi/issues/26]

```javascript
const dir = path.resolve(__dirname, '..', 'lib')

function copy(name, version, vue) {
  vue = vue || 'vue'
  const src = path.join(dir, `v${version}`, name)
  const dest = path.join(dir, name)
  let content = fs.readFileSync(src, 'utf-8')
  content = content.replace(/'vue'/g, `'${vue}'`)
  // unlink for pnpm, #92
  try {
    fs.unlinkSync(dest)
  } catch (error) { }
  fs.writeFileSync(dest, content, 'utf-8')
}
```

获取并定义对应`Vue`版本的路径和文件名称，随后将其以 `utf-8` 格式覆盖对应的文件。

如`Vue2.7`时，`v2.7`下的所有文件将会覆盖`lib`目录下的所有文件（除了`iife.js`文件，由于`iife`的性质因此作者直接在该文件内写好了三个版本的判断，而不通过覆盖的方式）。

