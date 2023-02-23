# 移动端安全区域适配 safe-area-inset-*

safe-area-inset-*这个css属性值，通常用于处理iPhone底部和刘海的间距适配

```css
.style {
    padding-bottom: 20px;
    padding-bottom: constant(safe-area-inset-bottom);
    padding-bottom: env(safe-area-inset-bottom);
}
```

最近用安卓的真机做测试的时候（基于安卓13的小米13）发现了有部分安卓手机识别了safe-area-inset-*，不过会识别为0

这样就会导致

```css
.style {
    padding-bottom: 20px;
    /* 这里实际是0并且覆盖了上面的20px */
    padding-bottom: constant(safe-area-inset-bottom); 
    padding-bottom: env(safe-area-inset-bottom);
}
```

因此不能直接定义safe-area-inset-*以适配iOS环境下，还需适配部分安卓手机识别safe-area-inset-*但是识别为0的情况

## 解决方案（通用函数，须在组件挂载后才能使用）

```typescript
let isSupport: undefined | boolean

const ELEMENT_STYLES = [
    'position: fixed',
    'z-index: -1',
    'height: constant(safe-area-inset-top)',
    'height: env(safe-area-inset-top)'
]

const ELEMENT_ID = 'safe-area-element'


export default function getSafeAreaSupport () {
    if (typeof isSupport !== 'undefined') {
        return isSupport
    }

    const div = document.createElement('div')
    div.style.cssText = ELEMENT_STYLES.join(';')
    div.id = ELEMENT_ID

    document.body.appendChild(div)
    const element = document.getElementById(ELEMENT_ID)

    if (element) {
        isSupport = element.offsetHeight > 0
        element.parentNode?.removeChild(element)
    }

    return isSupport
};
```

## 解决方案（vue hooks版，可在setup中直接调用）

```typescript
import { onMounted, ref } from 'vue';

const ELEMENT_STYLES = [
    'position: fixed',
    'z-index: -1',
    'height: constant(safe-area-inset-top)',
    'height: env(safe-area-inset-top)'
]

const ELEMENT_ID = 'safe-area-element'


export default function useSafeAreaSupport () {
    const isSupport = ref<undefined | boolean>()

    const defineSafeAreaSupport = () => {
        const div = document.createElement('div')
        div.style.cssText = ELEMENT_STYLES.join(';')
        div.id = ELEMENT_ID

        document.body.appendChild(div)
        const element = document.getElementById(ELEMENT_ID)

        if (element) {
            isSupport.value = element.offsetHeight > 0
            element.parentNode?.removeChild(element)
        }
    }
    
    onMounted(defineSafeAreaSupport)
    
    return {
        isSupport
    }
}
```
