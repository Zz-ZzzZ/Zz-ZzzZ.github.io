# 处理浏览器复制文本的兼容方法

在Web浏览器上可使用的复制文本`API`一般是`document.exceCommand('copy')`和`navigator.clipboard.writeText`，其用法和兼容性各有不同：

- `document.exceCommand`是一个比较老的`API`，目前在`mdn`文档已被标记为废弃，需要先选中文本再调用`API`才能复制，并且性能偏低，非异步，文本太长可能会出现卡顿。
- `navigator.clipboard`则没有前者的所有缺点，内部使用`Promise`返回执行结果，但是有个问题，在微信内置浏览器环境下使用时会报错，怀疑是内部禁用了这个`API`。

常见的解决方案是判断用户环境是否支持`navigator.clipboard`，若不支持则使用`document.exceCommand('copy')`，但是在微信内置浏览器环境下，不会报`navigator.clipboard`为`undefined`，
因此可以将两个`API`一起使用并且稍加改造一下。

```javascript
function createCommandCopy(text, target = document.body) {
  return new Promise((resolve, reject) => {
    if (typeof text !== 'string') {
      reject(
        `Expected parameter \`text\` to be a \`string\`, got \`${typeof text}\`.`
      )
    }

    if (typeof document.execCommand !== 'function') {
      reject('ExecCommand is not supported')
    }

    const element = document.createElement('textarea')
    const previouslyFocusedElement = document.activeElement

    element.value = text

    // Prevent keyboard from showing on mobile
    element.setAttribute('readonly', '')

    element.style.contain = 'strict'
    element.style.position = 'absolute'
    element.style.left = '-9999px'
    element.style.fontSize = '12pt' // Prevent zooming on iOS

    const selection = document.getSelection()
    const originalRange = selection.rangeCount > 0 && selection.getRangeAt(0)

    target.append(element)
    element.select()

    // Explicit selection workaround for iOS
    element.selectionStart = 0
    element.selectionEnd = text.length

    try {
      document.execCommand('copy')
    } catch (e) {
      reject('Exec copy command error')
    }

    element.remove()

    if (originalRange) {
      selection.removeAllRanges()
      selection.addRange(originalRange)
    }

    // Get the focus back on the previously focused element, if any
    if (previouslyFocusedElement) {
      previouslyFocusedElement.focus()
    }

    resolve(result)
  })
}
```

这是使用`document.exceCommand('copy')`的解决方案，其内部原理是创建一个不可见的`textarea`并将文本放入然后手动`select()`。

代码来自`copy-text-to-clipboard`这个库，我拿来用`Promise`改造了一下，`Clipboard.js`的原理和这个差不多。

```javascript
function copyTextToClipboard(text, target) {
  return new Promise((resolve, reject) => {
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      navigator.clipboard
        .writeText(text)
        .then(resolve)
        .catch(() => {
          createCommandCopy(text, target).then(resolve).catch(reject)
        })
    } else {
      try {
        createCommandCopy(text, target).then(resolve).catch(reject)
      } catch (e) {
        reject(e)
      }
    }
  })
}
```

在使用时，还是会优先使用`navigator.clipboard`，改造的点就是在进入`catch`时也会使用`document.exceCommand`，这样就兼容了普通浏览器和微信内置浏览器的环境并且统一使用`Promise`。
