# Typescript中的this类型声明

在开发中，可能经常会用到类似与防抖，节流之类的依靠闭包来实现的一些交互上的优化，而在Vue项目中（例如Vue2），methods、data之类的都是依靠this来调用，在正常的js文件内定义防抖/节流时是这么定义的
```javascript
export function throttle(func, delay) {
  let timer = null;
  return function (...args) {
    if (!timer) {
      func.apply(this, args);
      timer = setTimeout(() => {
        timer = null;
      }, delay);
    }
  };
}
```

而在ts文件内，为函数定义了类型之后是这样的

```typescript
export function throttle(func: Function, delay: number) {
  let timer: NodeJS.Timeout | null = null;
  return function (...args: unknown[]) {
    if (!timer) {
      func.apply(this, args);
      timer = setTimeout(() => {
        timer = null;
      }, delay);
    }
  };
}
```

按照这样的方法来定义类型，ts会报错 => **this**没有类型注释并且具有隐式类型，根据ts官方文档说明

> 默认情况下，**this**函数内部的类型是**any**. 从 TypeScript 2.0 开始，您可以提供显式**this**参数。
**this**参数是函数参数列表中最先出现的假参数。[指定**this**函数的类型](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-0.html#specifying-the-type-of-this-for-functions)。

因此需要在return function这一块添加this的类型

```typescript
export function throttle(func: Function, delay: number) {
  let timer: NodeJS.Timeout | null = null;
  return function (this: unknown, ...args: unknown[]) {
    if (!timer) {
      func.apply(this, args);
      timer = setTimeout(() => {
        timer = null;
      }, delay);
    }
  };
}
```

这里定义的this只是一个假的函数参数，不会参与函数参数成员
