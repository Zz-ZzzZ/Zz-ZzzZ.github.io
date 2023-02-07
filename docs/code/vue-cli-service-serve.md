# vue-cli-service serve

接下来阅读一下vue-cli-service中的serve指令

## 注册指令到Service类

```javascript
api.registerCommand('serve', {
    // 一些终端提示信息
}, async function serve(args) {
    // ...
})
```

调用api.registerCommand()向Service类中的commands注册一个指令，这里的api就是PluginAPI这个类，
在注册插件时，Service类会作为参数传入PluginAPI的构造函数内

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

启动serve时，会根据development模式进行一些针对性的webpack配置

1. 将sourceMap更改为eval-cheap-module-source-map
2. 开启HMR
3. 固定self指向防止丢失
4. 根据progress属性是否显示编译进度

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

接下来将会获取用户在vue.config文件内配置的webpack配置，并检查配置正确性，最后合并devServer配置，
validateWebpackConfig和验证vue.config基本一样，除了检查用户是否在webpack内自行定义了outputDir和publicPath外，
额外检查了用户是否自行将output.path设置为项目根路径

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

接下来是初始化一些devServer需要用到的配置，例如是否启动https，启动服务器的端口等

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

当处于非生产模式时，将热更新和devServer注入到webpack的entry中，这样在保存代码时，浏览器可以实时更新

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

## 创建webpack，并启动devServer

注入完毕后，初始化webpack实例并注册了一个服务调用失败的钩子

```javascript
// create compiler
const compiler = webpack(webpackConfig)

// handle compiler error
compiler.hooks.failed.tap('vue-cli-service serve', msg => {
    error(msg)
    process.exit(1)
})
```

创建并启动devServer

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

启动devServer后，注册了两个Nodejs信号事件，用于接收在通过一些方式退出该进程时的信号，如按下ctrl+c时，会发送SIGINT信号，cli就会关闭服务并终止进程，具体可参考node文档

```javascript
['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
        server.close(() => {
            process.exit(0)
        })
    })
})
```

:::tip SIGINT与SIGTERM -- 来自node文档

- 'SIGTERM' and 'SIGINT' have default handlers on non-Windows platforms that reset the terminal mode before exiting with
  code 128 + signal number. If one of these signals has a listener installed, its default behavior will be removed (
  Node.js will no longer exit).
- 'SIGTERM' is not supported on Windows, it can be listened on.
- 'SIGINT' from the terminal is supported on all platforms, and can usually be generated with Ctrl+C (though this may be
  configurable). It is not generated when terminal raw mode is enabled and Ctrl+C is used.

:::

之后注册了stdin的end事件，这里并没有注册readable事件来监听用户的输入，个人认为应该是与某些程序关联时，关联的程序关闭了而cli服务没有关闭

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

最后返回一个Promise，Promise内注册了一个编译完成的事件，用于编译完成后在控制台输出一些提示信息，和处理copy，open选项

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