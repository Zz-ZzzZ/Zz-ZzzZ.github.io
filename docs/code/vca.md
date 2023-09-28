# vue-create-api源码阅读笔记

这个库是在使用`cube-ui`时注意到的，一般用于C端创建`modal`/`dialog`会很方便[https://didi.github.io/cube-ui/#/zh-CN/docs/create-api]

### 添加 vue-create-api

从入口文件`src/index.js`内进入，`vue-create-api`是一个`Vue`插件，因此需要提供一个`install`的方法来挂载。

```javascript
function install(Vue, options = {}) {
  const {componentPrefix = '', apiPrefix = '$create-'} = options

  Vue.createAPI = function (Component, events, single) {
    if (isBoolean(events)) {
      single = events
      events = []
    }
    const api = apiCreator.call(this, Component, events, single)
    const createName = processComponentName(Component, {
      componentPrefix,
      apiPrefix,
    })
    Vue.prototype[createName] = Component.$create = api.create
    return api
  }
}
```

`options`提供了两个参数`componentPrefix`和`apiPrefix`，前者用于告知组件的前缀用于后续更方便的转化`api`名称，后者则用于自定义`api`的前缀，如`$create-dialog`最后会被转化为`$createDialog`。

在`install`内就做了一个操作，向`Vue`实例添加了一个`createAPI`方法，在文档中`createAPI`支持传入两个参数的简写方法，内部会对`events`进行布尔值类型判断，随后调用`apiCreator`来创建组件，在通过
`processComponentName`处理完组件的名称后会将创建组件的方法挂载到`Vue`和组件的`$create`属性，也就是调用`this.$xxx`时实际就是调用`api.create`。

### apiCreator

```javascript
const eventBeforeDestroy = 'hook:beforeDestroy'

export default function apiCreator(Component, events = [], single = false) {
  let Vue = this
  let singleMap = {}
  const beforeHooks = []

  // ...

  const api = {
    before(hook) {
      beforeHooks.push(hook)
    },
    create(config, renderFn, _single) {
      if (!isFunction(renderFn) && isUndef(_single)) {
        _single = renderFn
        renderFn = null
      }

      if (isUndef(_single)) {
        _single = single
      }

      const ownerInstance = this
      const isInVueInstance = !!ownerInstance.$on
      let options = {}

      if (isInVueInstance) {
        // Set parent to store router i18n ...
        options.parent = ownerInstance
        if (!ownerInstance.__unwatchFns__) {
          ownerInstance.__unwatchFns__ = []
        }
      }

      const renderData = parseRenderData(config, events)

      let component = null

      processProps(ownerInstance, renderData, isInVueInstance, (newProps) => {
        component && component.$updateProps(newProps)
      })
      processEvents(renderData, ownerInstance)
      process$(renderData)

      component = createComponent(renderData, renderFn, options, _single)

      if (isInVueInstance) {
        ownerInstance.$on(eventBeforeDestroy, beforeDestroy)
      }

      function beforeDestroy() {
        cancelWatchProps(ownerInstance)
        component.remove()
        component = null
      }

      return component
    }
  }

  return api
}
```

既然调用`this.$xxx`时实际就是调用`api.create`，那么就可以直接从`api.create`开始。

进入方法内部，首先会对`renderFn`和`_single`做一下转化，随后声明`ownerInstance`和`isInVueInstance`，`ownerInstance`只是为了保存当前的实例，有可能是组件，也有可能是`Vue`组件实例，因为可以用`this.$xxx`和`Component.$create`来创建组件。

若当前为`Vue`组件实例，则将其作为`parent`属性保存在`options`中。

### parseRenderData

```javascript
export default function parseRenderData(data = {}, events = {}) {
  events = parseEvents(events)
  const props = {...data}
  const on = {}
  for (const name in events) {
    if (events.hasOwnProperty(name)) {
      const handlerName = events[name]
      if (props[handlerName]) {
        on[name] = props[handlerName]
        delete props[handlerName]
      }
    }
  }
  return {
    props,
    on
  }
}

function parseEvents(events) {
  const parsedEvents = {}
  events.forEach((name) => {
    parsedEvents[name] = camelize(`on-${name}`)
  })
  return parsedEvents
}
```

在此函数内将会对`data`和`event`（分别是`createAPI`的第一、二个参数）进行转化，将会被浅拷贝后放在`props`中，`event`则会被转化为`{ name: onName }`的形式放在`on`内，最后返回`{ props, on }`

在得到`parseRenderData`的返回值`renderData`后会调用`processProps`和`processEvents`来分别处理`renderData.props`内可能存在的`$props`和`$events`属性，具体的处理规律在官方的文档内已给出。

:::tip $props
1. 如果 propKey 不是一个字符串, 则直接取 propKey 作为该 Prop 值。
2. 如果 propKey 是一个字符串，但该字符串并没有作为属性名存在于调用 $createAaBb() 的组件中，则直接取 propKey 这个字符串作为该 Prop 值。
3. 如果 propKey 是一个字符串，且作为属性名存在于调用 $createAaBb() 的组件中, 则会取该实例对应的属性值作为该 Prop 值。 同时会 watch 该属性，做到响应式更新。
:::

:::tip $events
1. 如果 eventValue 不是一个字符串, 那么直接取 eventValue 作为事件回调。
2. 如果 eventValue 是一个字符串, 那么会取调用 $createAaBb 的组件中以 eventValue 作为属性名的值，当做事件回调。
:::

随后会调用`process$`函数来处理以`$`作为开头的属性，这些属性最后也会被用于实例上。在属性都处理完成后调用`createComponent`

```javascript
function createComponent(renderData, renderFn, options, single) {
  beforeHooks.forEach((before) => {
    before(renderData, renderFn, single)
  })
  const ownerInsUid = options.parent ? options.parent._uid : -1
  const {comp, ins} = singleMap[ownerInsUid] ? singleMap[ownerInsUid] : {}
  if (single && comp && ins) {
    ins.updateRenderData(renderData, renderFn)
    ins.$forceUpdate()
    return comp
  }
  const component = instantiateComponent(Vue, Component, renderData, renderFn, options)
  const instance = component.$parent
  const originRemove = component.remove

  component.remove = function () {
    if (single) {
      if (!singleMap[ownerInsUid]) {
        return
      }
      singleMap[ownerInsUid] = null
    }
    originRemove && originRemove.apply(this, arguments)
    instance.destroy()
  }

  const originShow = component.show
  component.show = function () {
    originShow && originShow.apply(this, arguments)
    return this
  }

  const originHide = component.hide
  component.hide = function () {
    originHide && originHide.apply(this, arguments)
    return this
  }

  if (single) {
    singleMap[ownerInsUid] = {
      comp: component,
      ins: instance
    }
  }
  return component
}
```

在`createComponent`内，主要是对`instantiateComponent`得到的组件做一些拓展和单例限制，这样可以多次调用但是只创建一次。

```javascript
function instantiateComponent(Vue, Component, data, renderFn, options) {
  let renderData
  let childrenRenderFn

  const instance = new Vue({
    ...options,
    render(createElement) {
      let children = childrenRenderFn && childrenRenderFn(createElement)
      if (children && !Array.isArray(children)) {
        children = [children]
      }

      return createElement(Component, {...renderData}, children || [])
    },
    methods: {
      init() {
        document.body.appendChild(this.$el)
      },
      destroy() {
        this.$destroy()
        if (this.$el && this.$el.parentNode === document.body) {
          document.body.removeChild(this.$el)
        }
      }
    }
  })
  instance.updateRenderData = function (data, render) {
    renderData = data
    childrenRenderFn = render
  }
  instance.updateRenderData(data, renderFn)
  instance.$mount()
  instance.init()
  const component = instance.$children[0]
  component.$updateProps = function (props) {
    Object.assign(renderData.props, props)
    instance.$forceUpdate()
  }
  return component
}
```

这里就是关于函数式创建组件的核心了，其原理就是用`Vue`的`render`方法来创建组件，并把`$el`挂载到`body`下，还支持传入`renderFn`来定义组件内的插槽。

最后回到`api.create`内，若为`Vue`组件实例时还会在`hook:beforeDestroy`内注册一个事件，在实例销毁时也会一同销毁。

如果只是单纯的想使用函数式创建组件那么只需按照其挂载的思路使用就够了。

---

从`Vant`源码库内找到个工具函数可以基本满足这个需求

```typescript
// vue3.x
export function mountComponent(RootComponent: Component) {
  const app = createApp(RootComponent)
  const root = document.createElement('div')

  document.body.appendChild(root)

  return {
    instance: app.mount(root),
    unmount() {
      app.unmount()
      document.body.removeChild(root)
    }
  }
}
```
