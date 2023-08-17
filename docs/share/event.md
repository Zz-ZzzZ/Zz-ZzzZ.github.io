# 在不使用Event Bus来实现深层组件嵌套事件通信

在看`element-ui`的`Form`组件时发现在其内部实现了一套深层嵌套组件通信的方式，代码位于`/src/mixins/emitter.js`。

这个技巧挺有意思的，分享一下，相比`Event Bus`不会存在事件名冲突的问题。

```javascript
export default {
    methods: {
        dispatch(componentName, eventName, params) {
            var parent = this.$parent || this.$root;
            var name = parent.$options.componentName;

            while (parent && (!name || name !== componentName)) {
                parent = parent.$parent;

                if (parent) {
                    name = parent.$options.componentName;
                }
            }
            if (parent) {
                parent.$emit.apply(parent, [eventName].concat(params));
            }
        }
    }
}
```

这个`mixin`的作用是调用此方法后根据提供的`componentName`向上遍历（`componentName`是`element-ui`内自定义的一个组件属性，不一定要用`componentName`，`name`也是可以的。），
最后会得到该组件实例，依靠`vm.$emit()和vm.$on()`这两个`Api`来实现组件通信，`element-ui`内部通过此方法来完成由表单元素向`Form`传递事件的过程。

:::tip vm.$on() -- 来自Vue文档
监听当前实例上的自定义事件。事件可以由 vm.$emit 触发。回调函数会接收所有传入事件触发函数的额外参数。
:::
