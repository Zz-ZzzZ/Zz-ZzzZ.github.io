# 在JavaScript中实现style的CanIUse

在看Ant-design-Vue的小部分源码时，发现了一个比较实用的工具 **styleChecker**(/components/_util/styleChecker.ts)
中的两个函数 isStyleNameSupport 和 isStyleValueSupport

## isStyleNameSupport

源码

```typescript
function canUseDom() {
    return !!(typeof window !== 'undefined' && window.document && window.document.createElement);
}

// 判断styleName是否合法
const isStyleNameSupport = (styleName: string | string[]): boolean => {
  if (canUseDom() && window.document.documentElement) {
    // 如果只填了一个name则包装为数组形式  
    const styleNameList = Array.isArray(styleName) ? styleName : [styleName];
    const { documentElement } = window.document;
    // 使用some函数来查找name是否存在style对象中
    return styleNameList.some(name => name in documentElement.style);
  }
  return false;
};
```

## isStyleValueSupport

源码

```typescript
// 判断styleName和value是否合法
const isStyleValueSupport = (styleName: string, value: any) => {
  // 首先判断styleName是否是合法的  
  if (!isStyleNameSupport(styleName)) {
    return false;
  }
  // 在这里创建了一个div元素，然后复制了一份元素的style属性值
  // 若value合法则会修改div元素的style属性值，反之则不会修改
  // 最后返回复制后的元素与修改过后的div比对  
  const ele = document.createElement('div');
  const origin = ele.style[styleName];
  ele.style[styleName] = value;
  return ele.style[styleName] !== origin;
};
```

## 改进

根据这两个方法，我做了一次统一封装，并且使styleName的类型提示更完整

```typescript
type CSSProperty = keyof CSSStyleDeclaration

class CanIUseStyle {
    canIUseDom() {
        return !!(typeof window !== 'undefined' && window.document && window.document.createElement);
    }

    canIUseStyleName(styleName: CSSProperty | CSSProperty[]) {
        const {documentElement} = window.document;

        if (this.canIUseDom()) {
            const styleNameList = Array.isArray(styleName) ? styleName : [styleName];

            return styleNameList.some(name => name in documentElement.style);
        }

        return false;
    }

    canIUseStyleValue(styleName: CSSProperty, value: any) {
        if (!this.canIUseStyleName(styleName)) {
            return false;
        }

        const ele = document.createElement('div');
        const origin = ele.style[styleName];
        ele.style[<string>styleName] = value;
        return ele.style[styleName] !== origin;
    }
}
```