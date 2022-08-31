# Vue中的inheritAttrs属性

inheritAttrs(默认为true)这个属性一般用的很少，不怎么常见，但是对于高阶组件的编写很有帮助，
下面分享一下对这个属性的使用理解

## 介绍

> 默认情况下父作用域的不被认作 props 的 attribute 绑定 (attribute bindings) 将会“回退”且作为普通的 HTML attribute 应用在子组件的根元素上。当撰写包裹一个目标元素或另一个组件的组件时，这可能不会总是符合预期行为。通过设置 inheritAttrs 到 false，这些默认行为将会被去掉。而通过 (同样是 2.4 新增的) 实例 property $attrs 可以让这些 attribute 生效，且可以通过 v-bind 显性的绑定到非根元素上。
> **注意：这个选项不影响 class 和 style 绑定**。

根据官方文档的概述，在给子组件添加一不存在子组件定义的Props时，
将会被作为一个HTML标签的属性来使用

子组件
```vue
<template>
  <div>
    {{ text }}
  </div>
</template>

<script>
export default {
  props: {
    text: {
      type: String,
      default: ''
    }
  }
}
</script>
```

父组件
```vue
<template>
  <Child text="child" label="label"/>
</template>

<script>
import Child from "./child";

export default {
  name: "parent",
  components: {Child}
}
</script>

<style scoped>

</style>
```

在默认情况下，已定义的text会作为Props传入Child组件，
而未定义的label将会作为一个普通的HTML属性定义在Child组件内的根元素上

若设置inheritAttrs: false 时，label则不会出现在Child组件的根元素上
此时可以使用 v-bind = '$attrs' 来接收Props未定义而父组件传递的属性
使用 v-on = '$listeners' 来接收Emit未定义而父组件传递的Event

## 高阶组件中的使用

在日常开发中，可能出现需要封装第三方组件的情况下，
以我的例子，需要对el-dialog进行二次封装成为一个新的基础组件
而el-dialog的Props和Event属性都很多，如果按照el-dialog组件内的Props再同样的进行定义
Props到二次封装的组件，是一件很麻烦的事情，因此可以使用inheritAttrs的方式来代替需要定义相同的Props

```vue
<template>
  <el-dialog v-bind="$attrs" v-on="$listeners"></el-dialog>
</template>

<script>
export default {
  name: "ElDialogWrapper",
  inheritAttrs: false
}
</script>

<style scoped>

</style>
```

这样在使用组件时，对于传入未定义Props的组件属性时，就会传到ElDialogWrapper.vue的$attrs中，
直接按照el-dialog文档的Props或Event来传入对应属性，就等于传给了el-dialog，达到了不用声明相同的Props的麻烦

如果希望只取部分Props传递时也可从$attrs中取部分出来，一般用于多个组件都使用了$attrs

```vue
<template>
  <el-dialog v-bind="dialogConfig" v-on="$listeners"></el-dialog>
</template>

<script>
export default {
  name: "ElDialogWrapper",
  inheritAttrs: false,
  computed: {
    dialogConfig({$attrs}) {
      const { title } = $attrs 
      return {
        title
      }
    }
  }
}
</script>

<style scoped>

</style>
```

## 注意

虽然这种做法更为方便，且很容易就可以扩展第三方组件，不过有些编辑器只会提示已定义的Props，
在Props提示上会没有那么方便，不过可以通过安装对应第三方库的插件来做到Props提示