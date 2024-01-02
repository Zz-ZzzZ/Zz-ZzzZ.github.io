# vue-cli-service serve

接下来阅读一下`vue-cli-service`中的`serve`指令，也是内部对于`webpack-server`的进一步封装。

## 注册指令到Service类

```javascript
api.registerCommand('serve', {
    // 一些终端提示信息
}, async function serve(args) {
    // ...
})
```

调用`api.registerCommand()`向`Service`类中的`commands`注册一个指令，这里的`api`就是`PluginAPI`这个类，
在注册插件时，`Service`类会作为参数传入`PluginAPI`的构造函数内。

```javascript
class PluginAPI {
    /**
     * @param {string} id - Id of the plugin.
     * @param {Service} service - A vue-cli-service instance.
     */
    constructor(id, service) {
        this.id = id
        this.service = service
    }

    registerCommand(name, opts, fn) {
        if (typeof opts === 'function') {
            fn = opts
            opts = null
        }
        this.service.commands[name] = {fn, opts: opts || {}}
    }
}
```

启动`serve`时，会根据`development`模式进行一些针对性的`webpack`配置。

1. 将`sourceMap`更改为`eval-cheap-module-source-map`。
2. 开启`HMR`。
3. 固定`self`指向防止丢失。
4. 根据`progress`属性是否显示编译进度。

```javascript
    api.chainWebpack(webpackConfig => {
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
        webpackConfig
            .devtool('eval-cheap-module-source-map')

        webpackConfig
            .plugin('hmr')
            .use(require('webpack/lib/HotModuleReplacementPlugin'))

        // https://github.com/webpack/webpack/issues/6642
        // https://github.com/vuejs/vue-cli/issues/3539
        webpackConfig
            .output
            .globalObject(`(typeof self !== 'undefined' ? self : this)`)

        if (!process.env.VUE_CLI_TEST && options.devServer.progress !== false) {
            webpackConfig
                .plugin('progress')
                .use(require('webpack/lib/ProgressPlugin'))
        }
    }
})
```

## 获取并检查webpack配置

接下来将会获取用户在`vue.config`文件内配置的`webpack配置`，并检查配置正确性，最后合并`devServer`配置，
`validateWebpackConfig`和验证`vue.config`基本一样，除了检查用户是否在`webpack`内自行定义了`outputDir`和`publicPath`外，
额外检查了用户是否自行将`output.path`设置为项目根路径。

```javascript
// resolve webpack config
const webpackConfig = api.resolveWebpackConfig()

// check for common config errors
validateWebpackConfig(webpackConfig, api, options)

// load user devServer options with higher priority than devServer
// in webpack config
const projectDevServerOptions = Object.assign(
    webpackConfig.devServer || {},
    options.devServer
)
```

若用户自定义了入口文件则指向该路径

```javascript
const entry = args._[0]
if (entry) {
    webpackConfig.entry = {
        app: api.resolve(entry)
    }
}
```

## 初始化webpack devServer

接下来是初始化一些`devServer`需要用到的配置，例如是否启动`https`，启动服务器的端口等。

```javascript
 // resolve server options
const useHttps = args.https || projectDevServerOptions.https || defaults.https
const protocol = useHttps ? 'https' : 'http'
const host = args.host || process.env.HOST || projectDevServerOptions.host || defaults.host
portfinder.basePort = args.port || process.env.PORT || projectDevServerOptions.port || defaults.port
const port = await portfinder.getPortPromise()
const rawPublicUrl = args.public || projectDevServerOptions.public
const publicUrl = rawPublicUrl
    ? /^[a-zA-Z]+:\/\//.test(rawPublicUrl)
        ? rawPublicUrl
        : `${protocol}://${rawPublicUrl}`
    : null

const urls = prepareURLs(
    protocol,
    host,
    port,
    isAbsoluteUrl(options.publicPath) ? '/' : options.publicPath
)
const localUrlForBrowser = publicUrl || urls.localUrlForBrowser

const proxySettings = prepareProxy(
    projectDevServerOptions.proxy,
    api.resolve('public')
)
```

当处于非生产模式时，将`HMR`模块和`devServer`模块注入到`webpack`的`entry`中，这样在保存代码时，浏览器可以实时更新。

::: tip sockjs-node是什么
sockjs-node 是一个 WebSocket 库，它提供了类似 WebSocket 的双向通信能力，以帮助开发者在不支持 WebSocket 的环境下实现实时数据通信和实时更新等功能。

在现代 Web 应用中，实时数据通信已经成为了一个常见的需求，而 WebSocket 是一个强大的原生协议，能够实现双向数据传输。但是，并不是所有的浏览器和网络环境都支持 WebSocket，在这种情况下，sockjs-node 提供了一个非常好的替代方案。

sockjs-node 支持多种协议，包括 WebSocket、XHR streaming、JSONP polling 等，通过多种协议的组合，它能够更好地适应不同的浏览器和网络环境。sockjs-node 还提供了一个简单的 API，以便开发者在应用程序中方便地集成其功能。

sockjs-node 通常与 Node.js 一起使用，但它也可以与其他后端框架配合使用，以便于实现实时数据通信功能。
:::

```javascript
if (!isProduction) {
    const sockPath = projectDevServerOptions.sockPath || '/sockjs-node'
    const sockjsUrl = publicUrl
        // explicitly configured via devServer.public
        ? `?${publicUrl}&sockPath=${sockPath}`
        : isInContainer
            // can't infer public network url if inside a container...
            // use client-side inference (note this would break with non-root publicPath)
            ? ``
            // otherwise infer the url
            : `?` + url.format({
            protocol,
            port,
            hostname: urls.lanUrlForConfig || 'localhost'
        }) + `&sockPath=${sockPath}`
    const devClients = [
        // dev server client
        require.resolve(`webpack-dev-server/client`) + sockjsUrl,
        // hmr client
        require.resolve(projectDevServerOptions.hotOnly
            ? 'webpack/hot/only-dev-server'
            : 'webpack/hot/dev-server')
        // TODO custom overlay client
        // `@vue/cli-overlay/dist/client`
    ]

    if (process.env.APPVEYOR) {
        devClients.push(`webpack/hot/poll?500`)
    }
    // inject dev/hot client
    addDevClientToEntry(webpackConfig, devClients)
}
```

:::tip webpack-dev-server/client和webpack/hot/dev-server的关系
webpack-dev-server/client 模块主要负责建立 WebSocket 连接，获取实时更新的代码，以及将更新后的代码注入到页面中，实现整个页面的热替换。

而 webpack/hot/dev-server 模块则是热替换功能的核心模块， 主要用于在服务器端监视文件的变化，然后通过 sockjs 向客户端发送更新消息，告诉客户端有哪些模块需要更新。

这两个模块其实是运行在不同的环境中，webpack-dev-server/client 运行在浏览器端，而 webpack/hot/dev-server 则运行在服务器端。
:::

## 创建webpack，并启动devServer

注入完毕后，初始化`webpack`实例并注册了一个服务调用失败的钩子。

```javascript
// create compiler
const compiler = webpack(webpackConfig)

// handle compiler error
compiler.hooks.failed.tap('vue-cli-service serve', msg => {
    error(msg)
    process.exit(1)
})
```

创建并启动`devServer`。

```javascript
 // create server
const server = new WebpackDevServer(compiler, Object.assign({
    logLevel: 'silent',
    clientLogLevel: 'silent',
    historyApiFallback: {
        disableDotRule: true,
        rewrites: genHistoryApiFallbackRewrites(options.publicPath, options.pages)
    },
    contentBase: api.resolve('public'),
    watchContentBase: !isProduction,
    hot: !isProduction,
    injectClient: false,
    compress: isProduction,
    publicPath: options.publicPath,
    overlay: isProduction // TODO disable this
        ? false
        : {warnings: false, errors: true}
}, projectDevServerOptions, {
    https: useHttps,
    proxy: proxySettings,
    // eslint-disable-next-line no-shadow
    before(app, server) {
        // launch editor support.
        // this works with vue-devtools & @vue/cli-overlay
        app.use('/__open-in-editor', launchEditorMiddleware(() => console.log(
            `To specify an editor, specify the EDITOR env variable or ` +
            `add "editor" field to your Vue project config.\n`
        )))
        // allow other plugins to register middlewares, e.g. PWA
        api.service.devServerConfigFns.forEach(fn => fn(app, server))
        // apply in project middlewares
        projectDevServerOptions.before && projectDevServerOptions.before(app, server)
    },
    // avoid opening browser
    open: false
}))
```

启动`devServer`后，注册了两个`Nodejs`信号事件，用于接收在通过一些方式退出该进程时的信号，如按下`ctrl+c`时，会发送`SIGINT`信号，`cli`就会关闭服务并终止进程，具体可参考node文档。

```javascript
['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
        server.close(() => {
            process.exit(0)
        })
    })
})
```

:::tip SIGINT与SIGTERM

- 在Node.js环境中，SIGINT表示"Signal Interrupt"，是一个信号的名称，是由终端在用户按下Ctrl+C时发送给Node.js进程的信号。

- 在Node.js中，SIGTERM表示"Signal Terminate"，是一个信号的名称，通常用于指示需要终止进程的信号。与SIGINT不同，SIGTERM信号不是由键盘上的输入触发的，而是由操作系统或其他外部实体发起的。

:::

之后注册了`stdin`的`end`事件，这里并没有注册`readable`事件来监听用户的输入，个人认为应该是与某些程序关联时，关联的程序关闭了而`cli`服务没有关闭。

**从PR里找到了添加此段代码的地方 https://github.com/vuejs/vue-cli/issues/1597**

```javascript
if (args.stdin) {
  process.stdin.on('end', () => {
    server.close(() => {
      process.exit(0)
    })
  })

  process.stdin.resume()
}
```

## 注册编译完成事件

最后返回一个`Promise`，`Promise`内注册了一个编译完成的事件，用于编译完成后在控制台输出一些提示信息，和处理`copy，open`选项。

```javascript
    return new Promise((resolve, reject) => {
    // log instructions & open browser on first compilation complete
    let isFirstCompile = true
    compiler.hooks.done.tap('vue-cli-service serve', stats => {
        if (stats.hasErrors()) {
            return
        }

        let copied = ''
        if (isFirstCompile && args.copy) {
            try {
                require('clipboardy').writeSync(localUrlForBrowser)
                copied = chalk.dim('(copied to clipboard)')
            } catch (_) {
                /* catch exception if copy to clipboard isn't supported (e.g. WSL), see issue #3476 */
            }
        }

        const networkUrl = publicUrl
            ? publicUrl.replace(/([^/])$/, '$1/')
            : urls.lanUrlForTerminal

        console.log()
        console.log(`  App running at:`)
        console.log(`  - Local:   ${chalk.cyan(urls.localUrlForTerminal)} ${copied}`)
        if (!isInContainer) {
            console.log(`  - Network: ${chalk.cyan(networkUrl)}`)
        } else {
            console.log()
            console.log(chalk.yellow(`  It seems you are running Vue CLI inside a container.`))
            if (!publicUrl && options.publicPath && options.publicPath !== '/') {
                console.log()
                console.log(chalk.yellow(`  Since you are using a non-root publicPath, the hot-reload socket`))
                console.log(chalk.yellow(`  will not be able to infer the correct URL to connect. You should`))
                console.log(chalk.yellow(`  explicitly specify the URL via ${chalk.blue(`devServer.public`)}.`))
                console.log()
            }
            console.log(chalk.yellow(`  Access the dev server via ${chalk.cyan(
                `${protocol}://localhost:<your container's external mapped port>${options.publicPath}`
            )}`))
        }
        console.log()

        if (isFirstCompile) {
            isFirstCompile = false

            if (!isProduction) {
                const buildCommand = hasProjectYarn(api.getCwd()) ? `yarn build` : hasProjectPnpm(api.getCwd()) ? `pnpm run build` : `npm run build`
                console.log(`  Note that the development build is not optimized.`)
                console.log(`  To create a production build, run ${chalk.cyan(buildCommand)}.`)
            } else {
                console.log(`  App is served in production mode.`)
                console.log(`  Note this is for preview or E2E testing only.`)
            }
            console.log()

            if (args.open || projectDevServerOptions.open) {
                const pageUri = (projectDevServerOptions.openPage && typeof projectDevServerOptions.openPage === 'string')
                    ? projectDevServerOptions.openPage
                    : ''
                openBrowser(localUrlForBrowser + pageUri)
            }

            // Send final app URL
            if (args.dashboard) {
                const ipc = new IpcMessenger()
                ipc.send({
                    vueServe: {
                        url: localUrlForBrowser
                    }
                })
            }

            // resolve returned Promise
            // so other commands can do api.service.run('serve').then(...)
            resolve({
                server,
                url: localUrlForBrowser
            })
        } else if (process.env.VUE_CLI_TEST) {
            // signal for test to check HMR
            console.log('App updated')
        }
    })
    // 让devServer监听此次服务的端口和host
    server.listen(port, host, err => {
        if (err) {
            reject(err)
        }
    })
})

```
