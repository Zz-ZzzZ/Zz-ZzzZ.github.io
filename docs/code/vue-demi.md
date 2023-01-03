# vue-demi源码阅读笔记

在统一封装Hooks库时有用到vue-demi这个库，其实现方式比较有趣，同时也才知道npm script也是有生命周期的。
vue-demi的作用就是作为一个枢纽，所有需要的api都从这里导入，而枢纽会通过项目内的Vue版本来写入对应的文件使得从vue-demi导入时实际就是从vue中导入，
这样在编写兼容库时就不需要大量的if版本判断

## npm script - postinstall

npm script 是 package.json 中定义的一组内置脚本和自定义脚本。他们的目标是提供一种简单的方法来执行重复的任务，比如：启动项目、打包项目等

:::info script
```json
{
  "scripts":{
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```
:::

在npm script中，有一部分内置script，在npm执行不同的命令时触发对应的script，形成npm script的生命周期

postinstall则是内置script中的一员，它在npm install后触发，vue-demi则在此阶段进行操作

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

读取Vue的版本，根据Vue实例内的version属性来判断当前运行版本来分别写入对应的文件

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

在Vue2.6及以下的版本使用composition-api语法时需要搭配@vue/composition-api插件，同时过滤掉了@vue/composition-api内的default、version属性
避免覆盖原Vue示例下的对应属性，如果使用

```javascript
export * from '@vue/composition-api/dist/vue-composition-api.mjs'
```

则使用version时导入的是@vue/composition-api内的version，会有冲突[https://github.com/vueuse/vue-demi/issues/26]

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

获取并定义对应Vue版本的路径和文件名称，随后将其以 utf-8 格式覆盖对应的文件

如Vue2.7时，v2.7下的所有文件将会覆盖lib目录下的所有文件（除了iife.js文件，由于iife的性质因此作者直接在该文件内写好了三个版本的判断，而不通过覆盖的方式）

