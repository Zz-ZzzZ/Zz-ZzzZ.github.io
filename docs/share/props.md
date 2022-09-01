# Vue中快速定义Props属性的函数封装

## 起因

**Github上已经有了类似的现成且稳定的库，此为个人分享**

在定义Props时，如果有额外的选项需要定义时，则需要加上以下属性

```javascript
export default {
  props: {
    text: {
      type: String,
      default: '',
      required: false, 
      validator: () => {} 
    }
  }
}
```

这种写法比较麻烦，不太想写，于是对这三个额外选项(default/required/validator)，我各自封装了函数

## 定义类型

由于Vue中定义Props的类型依靠各个数据类型的构造函数，因此用一个map来对应他们的映射关系，
定义默认值也需要定义一个map来对应他们的映射关系

```typescript
export const propTypeConstructor = {
    string: String,
    number: Number,
    boolean: Boolean,
    array: Array,
    object: Object,
    function: Function,
    symbol: Symbol
}

export const propTypeDefault = {
    string: '',
    number: 0,
    boolean: false,
    array: () => [],
    object: () => ({}),
    function: () => {},
    symbol: Symbol()
}

// 取出key可以做到更好的类型提示
export type PropTypes = keyof typeof propTypeConstructor

export type PropTypeOption = {
    default?: unknown,
    required?: boolean | undefined,
    validator?: Function
}
```

## 判断传入的类型是否正确

其实这个地方可以不需要if判断，如果在强严格的ts环境下本身就会报错了，
而在Vue文件中如果未指定lang = 'ts'的情况下也只是一个小提示

```typescript
const definePropFactory = (type: PropTypes, option: PropTypeOption) => {
    const t = propTypeConstructor[type]

    if (!t) {
        console.error(`Vue Props定义不支持此类型 => ${type}`)
        return
    }

    return {type: t, ...option}
}
```

## 定义封装的函数

```typescript
import {PropTypes, PropTypeOption, propTypeConstructor, propTypeDefault} from './config'

export const definePropDefault = (type: PropTypes, defaultValue?: PropTypeOption['default']) => definePropFactory(type, {
    default: defaultValue ?? propTypeDefault[type]
})

export const definePropRequired = (type: PropTypes, required: PropTypeOption['required']) => definePropFactory(type, {
    required: !!required
})

export const definePropValidator = (type: PropTypes, validator: PropTypeOption['validator']) => definePropFactory(type, {
    validator
})
```

如果三个选项都需要的话，那还是按照原来的方法来，一般来讲很少，另外若为lang = ts 时，
可在propTypeConstructor的每个value后面添加对应的ts类型 

```typescript
String as PropType<string>
```
