# vue-cli-service 源码阅读笔记

## 入口 vue-cli-service.js

使用semver.js库来匹配当前操作系统的node版本是否大于vue-cli-service所要求的最低node版本（最低为node v8）

```javascript
const requiredVersion = require('../package.json').engines.node
const { semver, error } = require('@vue/cli-shared-utils')

if (!semver.satisfies(process.version, requiredVersion, { includePrerelease: true })) {
  error(
    `You are using Node ${process.version}, but vue-cli-service ` +
    `requires Node ${requiredVersion}.\nPlease upgrade your Node version.`
  )
  process.exit(1)
}
```

接下来将会实例化Service类，若未指定VUE_CLI_CONTEXT的值则使用当前路径

```javascript
const Service = require('../lib/Service')
const service = new Service(process.env.VUE_CLI_CONTEXT || process.cwd())
```

截取argv从第二项开始的所有元素，也就是 vue-cli-service 后面所有的参数，如 vue-cli-service serve = ['serve'] 并储存在rawArgv中

```javascript
const rawArgv = process.argv.slice(2)
```

使用minimist.js库为命令所传递的参数做匹配，若参数为boolean内的元素则匹配结果对应为 参数名：true，这样可以告知开启了哪些额外选项,
如vue-cli-service serve --open 则open: true

```javascript
const args = require('minimist')(rawArgv, {
  boolean: [
    // build
    'modern',
    'report',
    'report-json',
    'inline-vue',
    'watch',
    // serve
    'open',
    'copy',
    'https',
    // inspect
    'verbose'
  ]
})

```

定义command，这里的command就是rawArgv内的第一项也就是上面的serve

```javascript
const command = args._[0]
```

开启服务

```javascript
service.run(command, args, rawArgv).catch(err => {
  error(err)
  process.exit(1)
})
```

## new Service()

在上面调用vue-cli-service.js时，会实例化Service类，看看Service内初始化做了些什么

```javascript
class Service{
    constructor (context, { plugins, pkg, inlineOptions, useBuiltIn } = {}) {
        // 将当前类储存到process.VUE_CLI_SERVICE中
        process.VUE_CLI_SERVICE = this
        // 是否初始化完毕
        this.initialized = false
        // 上下文路径，一般为当前路径
        this.context = context
        // 内联配置options选项
        this.inlineOptions = inlineOptions
        // chainWebpack配置项
        this.webpackChainFns = []
        // configureWebpack配置项
        this.webpackRawConfigFns = []
        // webpack devServer配置项
        this.devServerConfigFns = []
        // 指令合集
        this.commands = {}
        // package.json的路径 一般为当前路径
        this.pkgContext = context
        // 解析package.json内的配置项
        this.pkg = this.resolvePkg(pkg)
        // package.json内配置的插件和默认提供的插件等插件的合并结果
        this.plugins = this.resolvePlugins(plugins, useBuiltIn)
        // 需要跳过初始化装载的plugins
        this.pluginsToSkip = new Set()
        // 构建模式合集
        // 将plugins内提供了defaultModes的插件添加到构建模式合集
        // 默认 { serve: development, build: production, inspect: development }
        this.modes = this.plugins.reduce((modes, { apply: { defaultModes }}) => {
            return Object.assign(modes, defaultModes)
        }, {})
    }
    // ...
}
```

### resolvePkg()

```javascript
const { resolvePkg } = require('@vue/cli-shared-utils')

class Service {
    // ...
    resolvePkg (inlinePkg, context = this.context) {
        if (inlinePkg) {
            return inlinePkg
        }

        const pkg = resolvePkg(context)
        
        if (pkg.vuePlugins && pkg.vuePlugins.resolveFrom) {
            this.pkgContext = path.resolve(context, pkg.vuePlugins.resolveFrom)
            return this.resolvePkg(null, this.pkgContext)
        }
        return pkg
    }
    // ...
}

```

若用户指定了package.json的路径则直接使用，若自行配置了pkg.vuePlugins.resolveFrom则将该package返回

::: warning
注意：这里的resolvePkg不是递归调用本身，而是使用了@vue/cli-shared-utils内的resolvePkg
:::

```javascript
const fs = require('fs')
const path = require('path')
const readPkg = require('read-pkg')

// 使用read-pkg.js读取package.json内的配置
exports.resolvePkg = function (context) {
    // 使用existsSync检查是否存在package.json文件
    if (fs.existsSync(path.join(context, 'package.json'))) {
        return readPkg.sync({ cwd: context })
    }
    return {}
}
```

**resolvePkg()内vuePlugins配置引用说明(来自vue-cli文档)**

::: tip
如果出于一些原因你的插件列在了该项目之外的其它 package.json 文件里，你可以在自己项目的 package.json 里设置 vuePlugins.resolveFrom 选项指向包含其它 package.json 的文件夹。
:::

### resolvePlugins()

```javascript
class Service {
    // ...
    resolvePlugins (inlinePlugins, useBuiltIn) {
        // 将id转化为plugin，如./commands/serve = { id: 'built-in:command/serve', apply: require('./command/serve')}
        const idToPlugin = id => ({
            id: id.replace(/^.\//, 'built-in:'),
            apply: require(id)
        })

        let plugins

        // 默认配置的plugin
        const builtInPlugins = [
            './commands/serve',
            './commands/build',
            './commands/inspect',
            './commands/help',
            // config plugins are order sensitive
            './config/base',
            './config/css',
            './config/prod',
            './config/app'
        ].map(idToPlugin)

        if (inlinePlugins) {
            // 当useBuiltIn配置为false时则不使用默认配置插件
            // 否则合并默认配置插件和inlinePlugins
            plugins = useBuiltIn !== false
                ? builtInPlugins.concat(inlinePlugins)
                : inlinePlugins
        } else {
            // 将package.json内的dependencies和devDependencies中符合vue-cli插件命名的插件合并
            const projectPlugins = Object.keys(this.pkg.devDependencies || {})
                .concat(Object.keys(this.pkg.dependencies || {}))
                .filter(isPlugin)
                .map(id => {
                    // 若存在于optionalDependencies中则直接使用而不转化id
                    if (
                        this.pkg.optionalDependencies &&
                        id in this.pkg.optionalDependencies
                    ) {
                        let apply = () => {}
                        try {
                            apply = require(id)
                        } catch (e) {
                            warn(`Optional dependency ${id} is not installed.`)
                        }

                        return { id, apply }
                    } else {
                        return idToPlugin(id)
                    }
                })
            // 将依赖内的插件和默认插件合并
            plugins = builtInPlugins.concat(projectPlugins)
        }

        // 直接访问插件 API 而不需要创建一个完整的插件
        if (this.pkg.vuePlugins && this.pkg.vuePlugins.service) {
            const files = this.pkg.vuePlugins.service
            // service必须是一个数组形式
            if (!Array.isArray(files)) {
                throw new Error(`Invalid type for option 'vuePlugins.service', expected 'array' but got ${typeof files}.`)
            }
            plugins = plugins.concat(files.map(file => ({
                id: `local:${file}`,
                apply: loadModule(`./${file}`, this.pkgContext)
            })))
        }

        return plugins
    }
    // ...
}
```

## service.run()

在vue-cli-service内初始化实例化Service类后，将开始启动服务

```javascript
class Service {
    // ...
    async run (name, args = {}, rawArgv = []) {
        // 获取构建模式，这里会从几个方式去获取构建模式
        // 1.内联传递 即 --mode development/production
        // 2.构建模式下但是开启了watch 则指定为development
        // 3.从初始化的默认构建模式配置中获取
        const mode = args.mode || (name === 'build' && args.watch ? 'development' : this.modes[name])
        // 配置不需要在init前就被调用的插件
        this.setPluginsToSkip(args)

        // 加载环境变量配置文件，加载用户定义的vue.config.js文件
        this.init(mode)

        args._ = args._ || []

        // 从指令集合内读取指令
        let command = this.commands[name]
        if (!command && name) {
            error(`command "${name}" does not exist.`)
            process.exit(1)
        }
        // 若未输入任何指令，即vue-cli-service 或 vue-cli-service help则调用help指令
        if (!command || args.help || args.h) {
            command = this.commands.help
        } else {
            // 读取完毕后移除该指令
            args._.shift() // remove command itself
            rawArgv.shift()
        }
        // 执行命令
        const { fn } = command
        return fn(args, rawArgv)
    }
    // ...
}
```
