# vue-cli-service 源码阅读笔记

## vue-cli-service.js

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

::: warning 注意
这里的resolvePkg不是递归调用本身，而是使用了@vue/cli-shared-utils内的resolvePkg
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

::: tip vuePlugins.resolveFrom
如果出于一些原因你的插件列在了该项目之外的其它 package.json 文件里，你可以在自己项目的 package.json 里设置 vuePlugins.resolveFrom 选项指向包含其它 package.json 的文件夹。
:::

### resolvePlugins()

```javascript
class Service {
    // ...
    resolvePlugins (inlinePlugins, useBuiltIn) {
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
            plugins = useBuiltIn !== false
                ? builtInPlugins.concat(inlinePlugins)
                : inlinePlugins
        } else {
            const projectPlugins = Object.keys(this.pkg.devDependencies || {})
                .concat(Object.keys(this.pkg.dependencies || {}))
                .filter(isPlugin)
                .map(id => {
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
      
            plugins = builtInPlugins.concat(projectPlugins)
        }
        
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

创建一个方法idToPlugin()，该方法可将提供的id转化为plugin，如./commands/serve = { id: 'built-in:command/serve', apply: require('./command/serve')}。

接下来会开始转化vue-cli提供的默认插件builtInPlugins，然后判断是否配置了inlinePlugins。

1. 若配置了inlinePlugins并且未配置useBuiltIn为false时则合并inlinePlugins和默认插件builtInPlugins。

2. 若配置了inlinePlugins但配置了useBuiltIn为false时则只使用inlinePlugins

::: tip useBuiltIn
当使用 Vue CLI 来构建一个库或是 Web Component 时，推荐给 @vue/babel-preset-app 传入 useBuiltIns: false 选项。这能够确保你的库或是组件不包含不必要的 polyfills。通常来说，打包 polyfills 应当是最终使用你的库的应用的责任。
:::

当未配置inlinePlugins时则合并devDependencies和dependencies内符合vue-cli插件(vue-cli-plugin-xxx)命名的插件，若插件名存在于optionalDependencies中则不使用idToPlugin转化

最后会查找有无在vuePlugins中定义service属性并合并

::: tip vuePlugins.service
如果你需要在项目里直接访问插件 API 而不需要创建一个完整的插件，你可以在 package.json 文件中使用 vuePlugins.service 选项：
:::

## service.run()

在vue-cli-service内初始化实例化Service类后，会在初始化一些配置后开始启动服务

```javascript
class Service {
    // ...
    async run (name, args = {}, rawArgv = []) {
        const mode = args.mode || (name === 'build' && args.watch ? 'development' : this.modes[name])
        
        this.setPluginsToSkip(args)
        
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
        // 执行指令
        const { fn } = command
        return fn(args, rawArgv)
    }
    // ...
}
```

首先先获取构建模式，这里会从几个方式去获取构建模式

::: info mode
* 内联传递 即 --mode development/production
* 属于build模式下但是开启了watch 则指定为development
* 从初始化的默认构建模式配置中(即this.modes)获取
:::

然后配置不需要在初始化前就被调用的插件，之后开始初始化配置选项setPluginsToSkip()

初始化完毕后commands内部就已经配置好了对应的指令服务，最后根据指令启动对应的服务，下面是记录初始化配置选项的过程

## service.init()

```javascript
class Service {
    // ...
    init (mode = process.env.VUE_CLI_MODE) {
        // 判断是否已完成初始化
        if (this.initialized) {
            return
        }
        this.initialized = true
        this.mode = mode

        // 读取.env.[mode]文件
        if (mode) {
            this.loadEnv(mode)
        }
        // 读取.env文件
        this.loadEnv()

        // 读取用户配置的vue.config.js文件
        const userOptions = this.loadUserOptions()
        // 将默认配置合并到用户配置中，默认配置内的选项将不会覆盖用户配置的选项
        // 具体参考defaultsDeep函数的实现
        this.projectOptions = defaultsDeep(userOptions, defaults())

        debug('vue:project-config')(this.projectOptions)

        // 调用所有plugin
        this.plugins.forEach(({id, apply}) => {
            // 跳过不需要在初始化时调用的插件
            if (this.pluginsToSkip.has(id)) return
            apply(new PluginAPI(id, this), this.projectOptions)
        })

        // 合并vue.config.js内的chainWebpack和configureWebpack属性
        if (this.projectOptions.chainWebpack) {
            this.webpackChainFns.push(this.projectOptions.chainWebpack)
        }
        if (this.projectOptions.configureWebpack) {
            this.webpackRawConfigFns.push(this.projectOptions.configureWebpack)
        }
    }
    // ...
}
```

这个方法内主要是读取env环境变量和读取vue.config.js，并调用所有插件，合并webpack配置。

::: tip loadEnv()
其中会调用两次loadEnv()是为了加载指定模式的环境变量和通用的环境变量文件

```shell
.env                # 在所有的环境中被载入
.env.local          # 在所有的环境中被载入，但会被 git 忽略
.env.[mode]         # 只在指定的模式中被载入
.env.[mode].local   # 只在指定的模式中被载入，但会被 git 忽略
```

来自vue-cli文档
:::

### loadEnv()

```javascript
class Service{
    // ...
    loadEnv (mode) {
        const logger = debug('vue:env')
        const basePath = path.resolve(this.context, `.env${mode ? `.${mode}` : ``}`)
        const localPath = `${basePath}.local`

        const load = envPath => {
            try {
                const env = dotenv.config({ path: envPath, debug: process.env.DEBUG })
                dotenvExpand(env)
                logger(envPath, env)
            } catch (err) {
                // only ignore error if file is not found
                if (err.toString().indexOf('ENOENT') < 0) {
                    error(err)
                }
            }
        }

        load(localPath)
        load(basePath)

        // by default, NODE_ENV and BABEL_ENV are set to "development" unless mode
        // is production or test. However the value in .env files will take higher
        // priority.
        if (mode) {
            // always set NODE_ENV during tests
            // as that is necessary for tests to not be affected by each other
            const shouldForceDefaultEnv = (
                process.env.VUE_CLI_TEST &&
                !process.env.VUE_CLI_TEST_TESTING_ENV
            )
            // 若为production/test下则直接使用该mode值，否则一律使用development
            const defaultNodeEnv = (mode === 'production' || mode === 'test')
                ? mode
                : 'development'
            // 若配置文件内未定义NODE_ENV则设置默认值
            if (shouldForceDefaultEnv || process.env.NODE_ENV == null) {
                process.env.NODE_ENV = defaultNodeEnv
            }
            // 若配置文件内未定义BABEL_ENV则设置默认值
            if (shouldForceDefaultEnv || process.env.BABEL_ENV == null) {
                process.env.BABEL_ENV = defaultNodeEnv
            }
        }
    }
    // ...
}
```

首先根据项目路径(this.context)拼接.env字符串储存在basePath中，在basePath的基础上再额外拼接.local储存在localPath中，
然后分别使用dotenv和dotenv-expand库加载到process中，最后根据条件决定是否设置NODE_ENV/BABEL_ENV
