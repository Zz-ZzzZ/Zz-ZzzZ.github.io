# vue-clamp源码阅读笔记

最近业务内有用到该插件，对实现方式比较好奇，因此来阅读一下源码，网上搜到的获取文本行数都是依靠文本行高来获取，这个则用了另外一个方式

## Clamp.js
一些简单的方法就直接在上面写注释了
```javascript
import {addListener, removeListener} from 'resize-detector'

export default {
    name: 'vue-clamp',
    props: {
        tag: {
            type: String,
            default: 'div'
        },
        autoresize: {
            type: Boolean,
            default: false
        },
        maxLines: Number,
        maxHeight: [String, Number],
        ellipsis: {
            type: String,
            default: '…'
        },
        location: {
            type: String,
            default: 'end',
            validator(value) {
                return ['start', 'middle', 'end'].indexOf(value) !== -1
            }
        },
        expanded: Boolean
    },
    data() {
        return {
            offset: null,
            text: this.getText(),
            localExpanded: !!this.expanded
        }
    },
    computed: {
        // 根据指定的location将省略字符对应插到前，中间，尾部
        clampedText() {
            if (this.location === 'start') {
                return this.ellipsis + (this.text.slice(0, this.offset) || '').trim()
            } else if (this.location === 'middle') {
                const split = Math.floor(this.offset / 2)
                return (this.text.slice(0, split) || '').trim() + this.ellipsis + (this.text.slice(-split) || '').trim()
            }

            return (this.text.slice(0, this.offset) || '').trim() + this.ellipsis
        },
        // 当文本长度与当前文本不同时，代表展开/收缩
        isClamped() {
            if (!this.text) {
                return false
            }
            return this.offset !== this.text.length
        },
        // 根据状态显示处理的文本/原始文本
        realText() {
            return this.isClamped ? this.clampedText : this.text
        },
        // 处理maxHeight单位
        realMaxHeight() {
            if (this.localExpanded) {
                return null
            }
            const {maxHeight} = this
            if (!maxHeight) {
                return null
            }
            return typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight
        }
    },
    watch: {
        expanded(val) {
            this.localExpanded = val
        },
        localExpanded(val) {
            if (val) {
                this.clampAt(this.text.length)
            } else {
                this.update()
            }
            if (this.expanded !== val) {
                this.$emit('update:expanded', val)
            }
        },
        isClamped: {
            handler(val) {
                this.$nextTick(() => this.$emit('clampchange', val))
            },
            immediate: true
        }
    },
    mounted() {
        this.init()

        this.$watch(
            (vm) => [vm.maxLines, vm.maxHeight, vm.ellipsis, vm.isClamped].join(),
            this.update
        )
        this.$watch((vm) => [vm.tag, vm.text, vm.autoresize].join(), this.init)
    },
    updated() {
        this.text = this.getText()
        this.applyChange()
    },
    beforeDestroy() {
        this.cleanUp()
    },
    methods: {
        init() {
            const contents = this.$slots.default
            if (!contents) {
                return
            }

            this.offset = this.text.length

            this.cleanUp()

            if (this.autoresize) {
                addListener(this.$el, this.update)
                this.unregisterResizeCallback = () => {
                    removeListener(this.$el, this.update)
                }
            }
            this.update()
        },
        update() {
            if (this.localExpanded) {
                return
            }
            this.applyChange()
            if (this.isOverflow() || this.isClamped) {
                this.search()
            }
        },
        expand() {
            this.localExpanded = true
        },
        collapse() {
            this.localExpanded = false
        },
        toggle() {
            this.localExpanded = !this.localExpanded
        },
        getLines() {
            return Object.keys(
                Array.prototype.slice.call(this.$refs.content.getClientRects()).reduce(
                    (prev, {top, bottom}) => {
                        const key = `${top}/${bottom}`
                        if (!prev[key]) {
                            prev[key] = true
                        }
                        return prev
                    },
                    {}
                )
            ).length
        },
        isOverflow() {
            if (!this.maxLines && !this.maxHeight) {
                return false
            }

            if (this.maxLines) {
                if (this.getLines() > this.maxLines) {
                    return true
                }
            }

            if (this.maxHeight) {
                if (this.$el.scrollHeight > this.$el.offsetHeight) {
                    return true
                }
            }
            return false
        },
        // 获取默认插槽内第一非空的节点文本值
        getText() {
            // Look for the first non-empty text node
            const [content] = (this.$slots.default || []).filter(
                (node) => !node.tag && !node.isComment
            )
            return content ? content.text : ''
        },
        moveEdge(steps) {
            this.clampAt(this.offset + steps)
        },
        // 更改文本长度
        clampAt(offset) {
            this.offset = offset
            this.applyChange()
        },
        // 重新计算文本内容并填充到页面时
        applyChange() {
            this.$refs.text.textContent = this.realText
        },
        // 根据条件对应向左/右位移
        stepToFit() {
            this.fill()
            this.clamp()
        },
        // 未超出且只有一行时向右位移
        fill() {
            while (
                (!this.isOverflow() || this.getLines() < 2) &&
                this.offset < this.text.length
                ) {
                this.moveEdge(1)
            }
        },
        // 超出且大于一行时向左位移
        clamp() {
            while (this.isOverflow() && this.getLines() > 1 && this.offset > 0) {
                this.moveEdge(-1)
            }
        },
        search(...range) {
            const [from = 0, to = this.offset] = range
            if (to - from <= 3) {
                this.stepToFit()
                return
            }
            const target = Math.floor((to + from) / 2)
            this.clampAt(target)
            if (this.isOverflow()) {
                this.search(from, target)
            } else {
                this.search(target, to)
            }
        },
        cleanUp() {
            if (this.unregisterResizeCallback) {
                this.unregisterResizeCallback()
            }
        }
    },
    render(h) {
        const contents = [
            h(
                'span',
                this.$isServer
                    ? {}
                    : {
                        ref: 'text',
                        attrs: {
                            'aria-label': this.text.trim()
                        }
                    },
                // 服务器渲染时不做处理 
                this.$isServer ? this.text : this.realText
            )
        ]

        const {expand, collapse, toggle} = this
        const scope = {
            expand,
            collapse,
            toggle,
            clamped: this.isClamped,
            expanded: this.localExpanded
        }
        const before = this.$scopedSlots.before
            ? this.$scopedSlots.before(scope)
            : this.$slots.before
        if (before) {
            contents.unshift(...(Array.isArray(before) ? before : [before]))
        }
        const after = this.$scopedSlots.after
            ? this.$scopedSlots.after(scope)
            : this.$slots.after
        if (after) {
            contents.push(...(Array.isArray(after) ? after : [after]))
        }
        const lines = [
            h(
                'span',
                {
                    style: {
                        boxShadow: 'transparent 0 0'
                    },
                    ref: 'content'
                },
                contents
            )
        ]
        return h(
            this.tag,
            {
                style: {
                    maxHeight: this.realMaxHeight,
                    overflow: 'hidden'
                }
            },
            lines
        )
    }
}

```

先从初始化开始，组件的初始化逻辑放在了mounted内，调用了init方法并挂载了两个监听

```javascript
function mounted() {
    this.init()

    this.$watch(
        (vm) => [vm.maxLines, vm.maxHeight, vm.ellipsis, vm.isClamped].join(),
        this.update
    )
    this.$watch((vm) => [vm.tag, vm.text, vm.autoresize].join(), this.init)
}
```

## init

```javascript
function init() {
    const contents = this.$slots.default
    if (!contents) {
        return
    }

    this.offset = this.text.length

    this.cleanUp()

    if (this.autoresize) {
        addListener(this.$el, this.update)
        this.unregisterResizeCallback = () => {
            removeListener(this.$el, this.update)
        }
    }
    this.update()
}
```

加载默认插槽并获取原文本，并清除已注册的监听器，若用户配置了autoresize属性则开启自适应监听，调用update()

## update()

```javascript
function update() {
    if (this.localExpanded) {
        return
    }
    this.applyChange()
    if (this.isOverflow() || this.isClamped) {
        this.search()
    }
}
```

localExpanded是组件内部维护的一个状态值，储存组件的展开/收起状态，将文本填充到页面上，根据文本是否超出或是否需要展开来调用search()

## search()

```javascript
function search(...range) {
    const [from = 0, to = this.offset] = range
    if (to - from <= 3) {
        this.stepToFit()
        return
    }
    const target = Math.floor((to + from) / 2)
    this.clampAt(target)
    if (this.isOverflow()) {
        this.search(from, target)
    } else {
        this.search(target, to)
    }
}
```

组件的核心功能，首先初始化了两个变量，from/to对应文本下标的起点和终点，使用二分法不断截断文本内容并填充到页面，然后会有一个是否超出限定行数的判断

1. 在文本超出了限定行数时将会不断地二分终点下标直到未超出为止
2. 在未超出限定行数时则会将上一次的二分下标作为起点，本次的二分下标作为终点来填补因二分截断空缺的内容，直到起点与终点相接近，也就是上面的第一个if判断

至于这里为什么是小于3因为没有注释可能也不清楚其中的意图，个人认为可能是默认的隐藏字符'...'的长度

::: info 例

1. 定义一个字符串 const str = 'VueVueVueVueVueVueVueVue' 当前长度为24，这里我使用长度来判断是否超出
2. 假设文本超出隐藏的下标为第4个Vue中的V，下标为10
3. 第一次进行二分截断，from为0，to为24，target的结果为12，截断的文本结果为VueVueVueVue，当前长度为12，判断是否超出，结果为true
4. 第二次进行二分截断，由于上一次结果为true，则from为0，to为12，target的结果为6，截断的文本结果为VueVue，当前长度为6，判断是否超出，结果为false
5. 第三次进行二分截断，由于上一次结果为false，则from为6，to为12，target的结果为9，截断的文本结果为VueVueVue，当前长度为9，判断是否超出，结果为false
6. 第四次进行二分截断，由于上一次结果为false，则from为9，to为12，已满足if判断条件，函数退出
   :::

## isOverflow()

```javascript
function isOverflow() {
    if (!this.maxLines && !this.maxHeight) {
        return false
    }

    if (this.maxLines) {
        if (this.getLines() > this.maxLines) {
            return true
        }
    }

    if (this.maxHeight) {
        if (this.$el.scrollHeight > this.$el.offsetHeight) {
            return true
        }
    }
    return false
}

function getLines() {
    return Object.keys(
        Array.prototype.slice.call(this.$refs.content.getClientRects()).reduce(
            (prev, {top, bottom}) => {
                const key = `${top}/${bottom}`
                if (!prev[key]) {
                    prev[key] = true
                }
                return prev
            },
            {}
        )
    ).length
}   
```

定义了3个if判断，当未定义maxLines和maxHeight时则直接返回false，当文本的行数大于限定行数时或元素的滚动高度大于了位移高度返回true，其他均为false，
获取文本行数使用了element.getClientRects()根据元素的每一个边框来获取对应的行数，具体细节可以参见文档

::: tip MDN文档
对于行内元素，元素内部的每一行都会有一个边框；对于块级元素，如果里面没有其他元素，一整块元素只有一个边框
:::

所以这就是为什么该插件使用span元素来渲染文本，因为span是行内元素，可以准确地得到文本的行数
