# vue-cli-service 源码阅读笔记

一直对`vue-cli-service`如何启动比较感兴趣，因此对着官方文档和`debug`尝试阅读一下(**version: vue-cli v4**)。

可以学习到命令行参数的获取与使用和内部对于`webpack`配置的合并。

## vue-cli-service.js

使用`semver.js`库来匹配当前操作系统的`node`版本是否大于`vue-cli-service`所要求的最低`node`版本（最低为**node v8**）。

```javascript
const requiredVersion = require('../package.json').engines.node
const {semver, error} = require('@vue/cli-shared-utils')

if (!semver.satisfies(process.version, requiredVersion, {includePrerelease: true})) {
    error(
        `You are using Node ${process.version}, but vue-cli-service ` +
        `requires Node ${requiredVersion}.\nPlease upgrade your Node version.`
    )
    process.exit(1)
}
```

接下来将会实例化`Service`类，若未指定`VUE_CLI_CONTEXT`的值则使用当前路径。

```javascript
const Service = require('../lib/Service')
const service = new Service(process.env.VUE_CLI_CONTEXT || process.cwd())
```

截取`argv`从第二项开始的所有元素，也就是 `vue-cli-service` 后面所有的参数，如 `vue-cli-service serve = ['serve']` 并储存在`rawArgv`中。

```javascript
const rawArgv = process.argv.slice(2)
```

使用`minimist.js`库为命令所传递的参数做匹配，这里将`boolean`属性的数组内的所有元素在作为参数时均作为布尔值。

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

::: tip minimist.js
例：`node index.js --name=John --age=30 --isEmployed=true`

则输出:

```
{
  name: 'John',
  age: 30,
  isEmployed: true,
  _: []
}
```

其中，_是一个数组，其中包含所有没有被解析为参数的未知参数。在此示例中，未知参数数量为**0**。
:::

定义`command`，这里的`command`就是`rawArgv`内的第一项也就是上面的`serve`。

```javascript
const command = args._[0]
```

开启服务。

```javascript
service.run(command, args, rawArgv).catch(err => {
    error(err)
    process.exit(1)
})
```

## new Service()

在上面调用`vue-cli-service.js`时，会实例化`Service`类，看看`Service`内初始化做了些什么。

```javascript
class Service {
    constructor(context, {plugins, pkg, inlineOptions, useBuiltIn} = {}) {
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
        this.modes = this.plugins.reduce((modes, {apply: {defaultModes}}) => {
            return Object.assign(modes, defaultModes)
        }, {})
    }

    // ...
}
```

### resolvePkg()

```javascript
const {resolvePkg} = require('@vue/cli-shared-utils')

class Service {
    // ...
    resolvePkg(inlinePkg, context = this.context) {
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

若用户指定了`package.json`的路径则直接使用，若自行配置了`pkg.vuePlugins.resolveFrom`则将该`package`返回。

::: warning 注意
这里的`resolvePk`g不是递归调用本身，而是使用了`@vue/cli-shared-utils`内的`resolvePkg`。
:::

```javascript
const fs = require('fs')
const path = require('path')
const readPkg = require('read-pkg')

// 使用read-pkg.js读取package.json内的配置
exports.resolvePkg = function (context) {
    // 使用existsSync检查是否存在package.json文件
    if (fs.existsSync(path.join(context, 'package.json'))) {
        return readPkg.sync({cwd: context})
    }
    return {}
}
```

**`1`resolvePkg()`内`vuePlugins`配置引用说明(来自vue-cli文档)**

::: tip vuePlugins.resolveFrom
如果出于一些原因你的插件列在了该项目之外的其它 `package.json` 文件里，你可以在自己项目的 `package.jso`n 里设置
`vuePlugins.resolveFrom` 选项指向包含其它 `package.json` 的文件夹。
:::

### resolvePlugins()

```javascript
class Service {
    // ...
    resolvePlugins(inlinePlugins, useBuiltIn) {
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
                        let apply = () => {
                        }
                        try {
                            apply = require(id)
                        } catch (e) {
                            warn(`Optional dependency ${id} is not installed.`)
                        }

                        return {id, apply}
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

创建一个方法`idToPlugin()`，该方法可将提供的`id`转化为`plugin`，如`./commands/serve = { id: 'built-in:command/serve', apply:
require('./command/serve')}`。

```javascript
const idToPlugin = id => ({
    id: id.replace(/^.\//, 'built-in:'),
    apply: require(id)
})
```

接下来会开始转化`vue-cli`提供的默认插件`builtInPlugins`。

在`vue-cli-service`中，提供的构建指令和对`webpack/loader`的配置都是以插件注入的形式来声明)。

```javascript
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
```

然后判断是否配置了`inlinePlugins`，`inlinePlugins`为构造函数内的参数: `plugins`。

```javascript
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
                let apply = () => {
                }
                try {
                    apply = require(id)
                } catch (e) {
                    warn(`Optional dependency ${id} is not installed.`)
                }

                return {id, apply}
            } else {
                return idToPlugin(id)
            }
        })

    plugins = builtInPlugins.concat(projectPlugins)
}
```

1. 若配置了`inlinePlugins`并且未配置`useBuiltIn`为`false`时则合并`inlinePlugins`和默认插件`builtInPlugins`。

2. 若配置了`inlinePlugins`但配置了`useBuiltIn`为`false`时则只使用`inlinePlugins`。

::: tip useBuiltIn
当使用 `Vue CLI` 来构建一个库或是 `Web Component` 时，推荐给 `@vue/babel-preset-app` 传入 `useBuiltIns: false`
选项。这能够确保你的库或是组件不包含不必要的 `polyfills`。通常来说，打包 `polyfills` 应当是最终使用你的库的应用的责任。
:::

当未配置`inlinePlugins`时则合并`devDependencies`和`dependencies`内符合`vue-cli`插件`(vue-cli-plugin-xxx)`
命名的插件，若插件名存在于`optionalDependencies`中则不使用`idToPlugin`转化。

最后会查找有无在`vuePlugins`中定义`service`属性并合并。

```javascript
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
```

::: tip vuePlugins.service
如果你需要在项目里直接访问插件 `API` 而不需要创建一个完整的插件，你可以在 `package.json` 文件中使用 `vuePlugins.service` 选项。
:::

## service.run()

在`vue-cli-service`内初始化实例化`Service`类后，会在初始化一些配置后开始启动服务。

```javascript
class Service {
    // ...
    async run(name, args = {}, rawArgv = []) {
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
        const {fn} = command
        return fn(args, rawArgv)
    }

    // ...
}
```

首先先获取构建模式，这里会从几个方式去获取构建模式。

```javascript
const mode = args.mode || (name === 'build' && args.watch ? 'development' : this.modes[name])
```

::: info mode

* 内联传递 即 `--mode development/production`。
* 属于`build`模式下但是开启了`watch`则指定为`development`。
* 从初始化的默认构建模式配置中(即`this.modes`)获取。
  :::

然后配置不需要在初始化前就被调用的插件，之后开始初始化配置选项`setPluginsToSkip()`。

初始化完毕后`commands`内部就已经配置好了对应的指令服务，最后根据指令启动对应的服务，下面是记录初始化配置选项的过程。

## service.init()

```javascript
class Service {
    // ...
    init(mode = process.env.VUE_CLI_MODE) {
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

这个方法内主要是读取`env`环境变量和读取`vue.config.js`，并调用所有插件，合并`webpack`配置。

::: tip loadEnv()
其中会调用两次`loadEnv()`是为了加载指定模式的环境变量和通用的环境变量文件。

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
class Service {
    // ...
    loadEnv(mode) {
        const logger = debug('vue:env')
        const basePath = path.resolve(this.context, `.env${mode ? `.${mode}` : ``}`)
        const localPath = `${basePath}.local`

        const load = envPath => {
            try {
                const env = dotenv.config({path: envPath, debug: process.env.DEBUG})
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

首先根据项目路径(`this.context`)拼接`.env`字符串储存在`basePath`中，在`basePath`的基础上再额外拼接`.local`储存在`localPath`中。

```javascript
const basePath = path.resolve(this.context, `.env${mode ? `.${mode}` : ``}`)
const localPath = `${basePath}.local`
```

然后分别使用`dotenv`和`dotenv-expand`库加载到`process`中，最后根据条件决定是否设置`NODE_ENV/BABEL_ENV`，所以一般环境变量配置文件不需要额外配置`NODE_ENV/BABEL_ENV`，
`vue-cli-service`会自动配置一个默认项。

```javascript
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
```

## service.loadUserOptions()

本方法用于读取用户配置的`vue.config`文件或在`package.json`内配置的`"vue"`字段并验证配置的正确性。

```javascript
class Service {
    // ...
    loadUserOptions() {
        // vue.config.c?js
        let fileConfig, pkgConfig, resolved, resolvedFrom
        const esm = this.pkg.type && this.pkg.type === 'module'

        const possibleConfigPaths = [
            process.env.VUE_CLI_SERVICE_CONFIG_PATH,
            './vue.config.js',
            './vue.config.cjs'
        ]

        let fileConfigPath
        for (const p of possibleConfigPaths) {
            const resolvedPath = p && path.resolve(this.context, p)
            if (resolvedPath && fs.existsSync(resolvedPath)) {
                fileConfigPath = resolvedPath
                break
            }
        }

        if (fileConfigPath) {
            if (esm && fileConfigPath === './vue.config.js') {
                throw new Error(`Please rename ${chalk.bold('vue.config.js')} to ${chalk.bold('vue.config.cjs')} when ECMAScript modules is enabled`)
            }

            try {
                fileConfig = loadModule(fileConfigPath, this.context)

                if (typeof fileConfig === 'function') {
                    fileConfig = fileConfig()
                }

                if (!fileConfig || typeof fileConfig !== 'object') {
                    // TODO: show throw an Error here, to be fixed in v5
                    error(
                        `Error loading ${chalk.bold(fileConfigPath)}: should export an object or a function that returns object.`
                    )
                    fileConfig = null
                }
            } catch (e) {
                error(`Error loading ${chalk.bold(fileConfigPath)}:`)
                throw e
            }
        }

        // package.vue
        pkgConfig = this.pkg.vue
        if (pkgConfig && typeof pkgConfig !== 'object') {
            error(
                `Error loading vue-cli config in ${chalk.bold(`package.json`)}: ` +
                `the "vue" field should be an object.`
            )
            pkgConfig = null
        }

        if (fileConfig) {
            if (pkgConfig) {
                warn(
                    `"vue" field in package.json ignored ` +
                    `due to presence of ${chalk.bold('vue.config.js')}.`
                )
                warn(
                    `You should migrate it into ${chalk.bold('vue.config.js')} ` +
                    `and remove it from package.json.`
                )
            }
            resolved = fileConfig
            resolvedFrom = 'vue.config.js'
        } else if (pkgConfig) {
            resolved = pkgConfig
            resolvedFrom = '"vue" field in package.json'
        } else {
            resolved = this.inlineOptions || {}
            resolvedFrom = 'inline options'
        }

        if (resolved.css && typeof resolved.css.modules !== 'undefined') {
            if (typeof resolved.css.requireModuleExtension !== 'undefined') {
                warn(
                    `You have set both "css.modules" and "css.requireModuleExtension" in ${chalk.bold('vue.config.js')}, ` +
                    `"css.modules" will be ignored in favor of "css.requireModuleExtension".`
                )
            } else {
                warn(
                    `"css.modules" option in ${chalk.bold('vue.config.js')} ` +
                    `is deprecated now, please use "css.requireModuleExtension" instead.`
                )
                resolved.css.requireModuleExtension = !resolved.css.modules
            }
        }

        // normalize some options
        ensureSlash(resolved, 'publicPath')
        if (typeof resolved.publicPath === 'string') {
            resolved.publicPath = resolved.publicPath.replace(/^\.\//, '')
        }
        removeSlash(resolved, 'outputDir')

        // validate options
        validate(resolved, msg => {
            error(
                `Invalid options in ${chalk.bold(resolvedFrom)}: ${msg}`
            )
        })

        return resolved
    }

    // ...
}
```

定义常量`esm`获取用户是否在`package.json`内定义`type为module`，也就是`es module`模式。

```javascript
const esm = this.pkg.type && this.pkg.type === 'module'
```

随后定义了一个可能存在的配置文件路径数组，这里严格限定了文件类型，只支持`vue.config.(js/cjs)`，
接下来开始寻找`vue.config.(js/cjs)`配置文件，若路径正确并且存在此文件则跳出循环。

```javascript
 const possibleConfigPaths = [
    process.env.VUE_CLI_SERVICE_CONFIG_PATH,
    './vue.config.js',
    './vue.config.cjs'
]

let fileConfigPath
for (const p of possibleConfigPaths) {
    const resolvedPath = p && path.resolve(this.context, p)
    if (resolvedPath && fs.existsSync(resolvedPath)) {
        fileConfigPath = resolvedPath
        break
    }
}
```

当存在此文件时，进行文件的模块规范判断

```javascript
if (esm && fileConfigPath === './vue.config.js') {
    throw new Error(`Please rename ${chalk.bold('vue.config.js')} to ${chalk.bold('vue.config.cjs')} when ECMAScript modules is enabled`)
}
```

::: warning
由于`vue.config.js`仅支持`commonjs`规范，若用户配置了`package.json`为`es module`模式时并且后缀名为`.js`,
需要更改`vue.config.js`后缀名为`.cjs `声明该文件是一个`commonjs`模块。
:::

接下来尝试读取`vue.config`，有两种形式可使用，若为函数类型则获取它的返回结果，当读取模块失败时，代表模块未正确导出，提醒用户注意文件的导出形式。

```javascript
try {
    fileConfig = loadModule(fileConfigPath, this.context)

    if (typeof fileConfig === 'function') {
        fileConfig = fileConfig()
    }

    if (!fileConfig || typeof fileConfig !== 'object') {
        // TODO: show throw an Error here, to be fixed in v5
        error(
            `Error loading ${chalk.bold(fileConfigPath)}: should export an object or a function that returns object.`
        )
        fileConfig = null
    }
} catch (e) {
    error(`Error loading ${chalk.bold(fileConfigPath)}:`)
    throw e
}
```

::: tip vue.config两种配置形式
Object

```javascript
module.exports = {
    // config
}
```

Function

```javascript
module.exports = function () {
    return {
        // config
    }
}
```

:::

除了配置`vue.config`文件以外还可以在`package.json`内配置字段`"vue"`来代替`vue.config`文件。**导出格式必须为对象**，否则提示错误。

若同时存在`vue.config`配置文件和在`package.json`中配置了`vue`字段则优先使用配置文件，并抛出警告用户移除`package.json`内的`vue`字段。

```javascript
// package.vue
pkgConfig = this.pkg.vue
if (pkgConfig && typeof pkgConfig !== 'object') {
    error(
        `Error loading vue-cli config in ${chalk.bold(`package.json`)}: ` +
        `the "vue" field should be an object.`
    )
    pkgConfig = null
}

if (fileConfig) {
    if (pkgConfig) {
        warn(
            `"vue" field in package.json ignored ` +
            `due to presence of ${chalk.bold('vue.config.js')}.`
        )
        warn(
            `You should migrate it into ${chalk.bold('vue.config.js')} ` +
            `and remove it from package.json.`
        )
    }
    resolved = fileConfig
    resolvedFrom = 'vue.config.js'
} else if (pkgConfig) {
    resolved = pkgConfig
    resolvedFrom = '"vue" field in package.json'
} else {
    resolved = this.inlineOptions || {}
    resolvedFrom = 'inline options'
}
```

由于`vue-cli v3`和`v4`有`css`相关的`api`弃用，因此会加一层判断，具体可查阅`vue-cli`文档。

```javascript
 if (resolved.css && typeof resolved.css.modules !== 'undefined') {
    if (typeof resolved.css.requireModuleExtension !== 'undefined') {
        warn(
            `You have set both "css.modules" and "css.requireModuleExtension" in ${chalk.bold('vue.config.js')}, ` +
            `"css.modules" will be ignored in favor of "css.requireModuleExtension".`
        )
    } else {
        warn(
            `"css.modules" option in ${chalk.bold('vue.config.js')} ` +
            `is deprecated now, please use "css.requireModuleExtension" instead.`
        )
        resolved.css.requireModuleExtension = !resolved.css.modules
    }
}
```

接下来会对配置项`publicPath/outputDir`做一些字符替换。

```javascript
// 为传递的publicPath的路径结尾拼接'/'，如/root => /root/
ensureSlash(resolved, 'publicPath')
// 移除publicPath中的'./'字符
if (typeof resolved.publicPath === 'string') {
    resolved.publicPath = resolved.publicPath.replace(/\.\//, '')
}
// 移除尾部的'/'，如/root/ => /root
removeSlash(resolved, 'outputDir')
```

最后使用`@hapi/joi.js`库对用户配置的文件进行验证，验证规则如下。

::: info cli-service/lib/options.js

```javascript
const schema = createSchema(joi => joi.object({
    publicPath: joi.string().allow(''),
    outputDir: joi.string(),
    assetsDir: joi.string().allow(''),
    indexPath: joi.string(),
    filenameHashing: joi.boolean(),
    runtimeCompiler: joi.boolean(),
    transpileDependencies: joi.array(),
    productionSourceMap: joi.boolean(),
    // 可以为布尔值或数字(整数)
    parallel: joi.alternatives().try([
        joi.boolean(),
        joi.number().integer()
    ]),
    devServer: joi.object(),
    pages: joi.object().pattern(
        /\w+/,
        joi.alternatives().try([
            joi.string().required(),
            joi.array().items(joi.string().required()),

            joi.object().keys({
                entry: joi.alternatives().try([
                    joi.string().required(),
                    joi.array().items(joi.string().required())
                ]).required()
            }).unknown(true)
        ])
    ),
    // 可选则为['', 'anonymous', 'use-credentials']
    crossorigin: joi.string().valid(['', 'anonymous', 'use-credentials']),
    integrity: joi.boolean(),

    // css
    css: joi.object({
        // TODO: deprecate this after joi 16 release
        modules: joi.boolean(),
        requireModuleExtension: joi.boolean(),
        extract: joi.alternatives().try(joi.boolean(), joi.object()),
        sourceMap: joi.boolean(),
        loaderOptions: joi.object({
            css: joi.object(),
            sass: joi.object(),
            scss: joi.object(),
            less: joi.object(),
            stylus: joi.object(),
            postcss: joi.object()
        })
    }),

    // webpack
    chainWebpack: joi.func(),
    configureWebpack: joi.alternatives().try(
        joi.object(),
        joi.func()
    ),

    // known runtime options for built-in plugins
    lintOnSave: joi.any().valid([true, false, 'error', 'warning', 'default']),
    pwa: joi.object(),

    // 3rd party plugin options
    pluginOptions: joi.object()
}))
```

:::

## service.resolveWebpackConfig()

本方法用于解析并合并用户配置的`webpack`相关配置。

```javascript
class Service {
    // ...
    resolveChainableWebpackConfig() {
        const chainableConfig = new Config()
        // apply chains
        this.webpackChainFns.forEach(fn => fn(chainableConfig))
        return chainableConfig
    }

    resolveWebpackConfig(chainableConfig = this.resolveChainableWebpackConfig()) {
        if (!this.initialized) {
            throw new Error('Service must call init() before calling resolveWebpackConfig().')
        }
        // get raw config
        let config = chainableConfig.toConfig()
        const original = config
        // apply raw config fns
        this.webpackRawConfigFns.forEach(fn => {
            if (typeof fn === 'function') {
                // function with optional return value
                const res = fn(config)
                if (res) config = merge(config, res)
            } else if (fn) {
                // merge literal values
                config = merge(config, fn)
            }
        })

        // #2206 If config is merged by merge-webpack, it discards the __ruleNames
        // information injected by webpack-chain. Restore the info so that
        // vue inspect works properly.
        if (config !== original) {
            cloneRuleNames(
                config.module && config.module.rules,
                original.module && original.module.rules
            )
        }

        // check if the user has manually mutated output.publicPath
        const target = process.env.VUE_CLI_BUILD_TARGET
        if (
            !process.env.VUE_CLI_TEST &&
            (target && target !== 'app') &&
            config.output.publicPath !== this.projectOptions.publicPath
        ) {
            throw new Error(
                `Do not modify webpack output.publicPath directly. ` +
                `Use the "publicPath" option in vue.config.js instead.`
            )
        }

        if (
            !process.env.VUE_CLI_ENTRY_FILES &&
            typeof config.entry !== 'function'
        ) {
            let entryFiles
            if (typeof config.entry === 'string') {
                entryFiles = [config.entry]
            } else if (Array.isArray(config.entry)) {
                entryFiles = config.entry
            } else {
                entryFiles = Object.values(config.entry || []).reduce((allEntries, curr) => {
                    return allEntries.concat(curr)
                }, [])
            }

            entryFiles = entryFiles.map(file => path.resolve(this.context, file))
            process.env.VUE_CLI_ENTRY_FILES = JSON.stringify(entryFiles)
        }

        return config
    }

    // ...
}
```

参数`chainableConfig`默认值是使用方法`resolveChainableWebpackConfig`，而`resolveChainableWebpackConfig`的作用是使用`webpack-chain`初始化链式配置，
并作为参数传给`chainWebpack`属性的每一个配置项，然后返回这个链式配置。

```javascript
resolveChainableWebpackConfig()
{
    const chainableConfig = new Config()
    // apply chains
    this.webpackChainFns.forEach(fn => fn(chainableConfig))
    return chainableConfig
}
```

调用时，会检查`Service`类有无初始化完毕。

```javascript
if (!this.initialized) {
    throw new Error('Service must call init() before calling resolveWebpackConfig().')
}
```

随后获取`webpack-chain`的最终配置结果。

```javascript
let config = chainableConfig.toConfig()
const original = config
```

`configureWebpack`支持两种配置方式，一种是使用对象形式，一种是使用函数，但是需要有返回值，最后会被合并。

::: tip configureWebpack
如果这个值是一个函数，则会接收被解析的配置作为参数。该函数既可以修改配置并不返回任何东西，也可以返回一个被克隆或合并过的配置版本。
:::

```javascript
this.webpackRawConfigFns.forEach(fn => {
    if (typeof fn === 'function') {
        // function with optional return value
        const res = fn(config)
        if (res) config = merge(config, res)
    } else if (fn) {
        // merge literal values
        config = merge(config, fn)
    }
})
```

接下来会检查用户有无在`configureWebpack`或`chainWebpack`中定义了`output.publicPath`属性，由于`vue-cli`需要在其他地方使用到`publicPath`属性，
因此必须`publicPath`属性必须配置在`vue.config`文件内。

```javascript
 const target = process.env.VUE_CLI_BUILD_TARGET
if (
    !process.env.VUE_CLI_TEST &&
    (target && target !== 'app') &&
    config.output.publicPath !== this.projectOptions.publicPath
) {
    throw new Error(
        `Do not modify webpack output.publicPath directly. ` +
        `Use the "publicPath" option in vue.config.js instead.`
    )
}
```

然后根据条件格式化`entry`选项，最终保存到`VUE_CLI_ENTRY_FILES`中。

::: tip entry支持的格式

```javascript
const entry = './main.js'
const entry = ['./main.js']
const entry = {
    main: './main.js'
}
```

:::

```javascript
 if (
    !process.env.VUE_CLI_ENTRY_FILES &&
    typeof config.entry !== 'function'
) {
    let entryFiles
    if (typeof config.entry === 'string') {
        entryFiles = [config.entry]
    } else if (Array.isArray(config.entry)) {
        entryFiles = config.entry
    } else {
        entryFiles = Object.values(config.entry || []).reduce((allEntries, curr) => {
            return allEntries.concat(curr)
        }, [])
    }

    entryFiles = entryFiles.map(file => path.resolve(this.context, file))
    process.env.VUE_CLI_ENTRY_FILES = JSON.stringify(entryFiles)
}
```
