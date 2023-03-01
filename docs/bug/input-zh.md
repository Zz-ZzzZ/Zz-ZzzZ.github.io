# input在某些环境下输入拼音的问题（移动端）

在给input做输入限制时，没有使用v-model语法糖进行输入绑定，而是用比较原始的方法

```vue
<template>
  <div id="app">
    <input :value="modelValue" @input="handleInput"/>
  </div>
</template>

<script>
import { ref } from '@vue/composition-api'
// 清除除了中文和字母以外的字符
const NAME_REG_EXP = /[^A-Za-z\u4e00-\u9fa5]/g
export default {
  name: 'App',
  setup: () => {
    const modelValue = ref('')

    const clearUselessWord = (str) => {
      return String(str).replace(NAME_REG_EXP, '')
    }

    const handleInput = (e) => {
      const value = clearUselessWord(e.target.value)
      e.target.value = value
      modelValue.value = value
    }

    return {
      modelValue,
      handleInput
    }
  }
}
</script>

```

这个方法在**Android**环境下是正常的，因为**Android**的输入法逻辑是输入拼音时，拼音不会出现在**input**内，则不会触发**input**事件，
而在**iOS**环境下（只要是输入时出现拼音都会出现），输入拼音时会触发**input**事件，会导致在在做输入限制时出现一些不符合预期的情况。

## 如何解决（通用）

通过注册[compositionstart](https://developer.mozilla.org/zh-CN/docs/Web/API/Element/compositionstart_event)和
[compositionend](https://developer.mozilla.org/zh-CN/docs/Web/API/Element/compositionend_event)
和事件来对输入拼音时和对选择候选文字时进行处理

```vue
<template>
  <div id="app">
    <input :value="modelValue" @input="handleInput" @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd"/>
  </div>
</template>

<script>
import { ref } from '@vue/composition-api'

const NAME_REG_EXP = /[^A-Za-z\u4e00-\u9fa5]/g
export default {
  name: 'App',
  setup: () => {
    const modelValue = ref('')
    let isLock = false

    const clearUselessWord = (str) => {
      return String(str).replace(NAME_REG_EXP, '')
    }

    const handleInput = (e) => {
      const timer = setTimeout(() => {
        if (!isLock) {
          const value = clearUselessWord(e.target.value)
          e.target.value = value
          modelValue.value = value
          clearTimeout(timer)
        }
      }, 0)
    }

    const handleCompositionStart = () => {
      isLock = true
    }

    const handleCompositionEnd = () => {
      isLock = false
    }

    return {
      modelValue,
      handleInput,
      handleCompositionStart,
      handleCompositionEnd
    }
  }
}
</script>
```

由于**compositionend**触发的时机在**input**触发后，并且我的限制操作放在了处理input事件内部，因此给事件内执行的代码包装上一个**timeout**，推到下一个**macroTask**

## 如何解决（vue）

经过查找了一番资料后，发现vue内部已经做了处理，但是需要使用**v-model**绑定，那么可以使用**watch**做限制

```vue
<template>
  <div id="app">
    <input v-model="modelValue"/>
  </div>
</template>

<script>
import { ref, watch } from '@vue/composition-api'

const NAME_REG_EXP = /[^A-Za-z\u4e00-\u9fa5]/g
export default {
  name: 'App',
  setup: () => {
    const modelValue = ref('')

    const clearUselessWord = (str) => {
      return String(str).replace(NAME_REG_EXP, '')
    }

    watch(modelValue, (value) => {
      modelValue.value = clearUselessWord(value)
    })

    return {
      modelValue,
    }
  }
}
</script>
```

## vue是如何处理的

在路径`/platforms/web/runtime/directives/model.ts`内部找到了相关处理（version 2.7.14）

```typescript
if (vnode.tag === 'select') {
  // ... 
} else if (vnode.tag === 'textarea' || isTextInputType(el.type)) {
    el._vModifiers = binding.modifiers
    if (!binding.modifiers.lazy) {
        el.addEventListener('compositionstart', onCompositionStart)
        el.addEventListener('compositionend', onCompositionEnd)
        // Safari < 10.2 & UIWebView doesn't fire compositionend when
        // switching focus before confirming composition choice
        // this also fixes the issue where some browsers e.g. iOS Chrome
        // fires "change" instead of "input" on autocomplete.
        el.addEventListener('change', onCompositionEnd)
        /* istanbul ignore if */
        if (isIE9) {
            el.vmodel = true
        }
    }
}
  
```

当vnode类型为**textarea**或**input输入框**时，注册了**compositionstart**和**compositionend**事件，在某些特殊情况下可能无法触发**compositionend**时则触发**change**事件，
若使用了**lazy**修饰符则不做处理（使用lazy修饰符时则注册change事件）

```typescript
function onCompositionStart(e) {
  e.target.composing = true
}

function onCompositionEnd(e) {
  // prevent triggering an input event for no reason
  if (!e.target.composing) return
  e.target.composing = false
  trigger(e.target, 'input')
}
```

与我做法稍微不同，vue在元素的**target**内添加了一个名为**composing**的属性作为标识，当触发**compositionend**时手动触发**input**事件

```typescript
function trigger(el, type) {
  const e = document.createEvent('HTMLEvents')
  e.initEvent(type, true, true)
  el.dispatchEvent(e)
}
```

使用原生api创建一个事件后由该元素触发此事件

::: tip
initEvent事件即将弃用，可使用new Event代替
```typescript
function trigger(el, type) {
    const e = new Event(type, {
        bubbles: true,
        cancelable: true
    })
    el.dispatchEvent(e)
}
```
:::
