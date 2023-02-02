# Day.js源码阅读笔记

一个dayjs()就能完成许多繁琐的操作，有点意思

## dayjs()

```javascript
const dayjs = function (date, c) {
  if (isDayjs(date)) {
    return date.clone()
  }

  const cfg = typeof c === 'object' ? c : {}
  cfg.date = date
  cfg.args = arguments
  return new Dayjs(cfg)
}

```

函数执行的开始将判断日期是否为Dayjs类，若属于Dayjs则返回对应的克隆体（可以理解为拷贝一份），clone()方法将在之后详细说明

```javascript
const isDayjs = d => d instanceof Dayjs
```

接下来判断用户是否定义了配置项，若未定义，则生成一个**空对象**，
反之则为配置项添加**date**属性（值来自于第一个参数date）和**args**属性（值来自于arguments对象），最后返回**Dayjs类**

## Class Dayjs

```javascript
class Dayjs {
  constructor(cfg) {
    this.$L = parseLocale(cfg.locale, null, true)
    this.parse(cfg)
  }

   parse(cfg) {
      this.$d = parseDate(cfg)
      this.$x = cfg.x || {}
      this.init()
   }

   init() {
      const { $d } = this
      this.$y = $d.getFullYear()
      this.$M = $d.getMonth()
      this.$D = $d.getDate()
      this.$W = $d.getDay()
      this.$H = $d.getHours()
      this.$m = $d.getMinutes()
      this.$s = $d.getSeconds()
      this.$ms = $d.getMilliseconds()
   }
  // ...
}
```

在构造函数中，会进行三步操作

1. 解析用户配置的语言
2. 解析传递的date
3. 将解析后的date根据年月日，时分秒以及毫秒分别挂载到对应的属性上

### 解析用户配置的语言

```javascript
import en from './locale/en'

let L = 'en' // global locale
const Ls = {} // global loaded locale
Ls[L] = en

const parseLocale = (preset, object, isLocal) => {
  let l
  if (!preset) return L
  if (typeof preset === 'string') {
    const presetLower = preset.toLowerCase()
    if (Ls[presetLower]) {
      l = presetLower
    }
    if (object) {
      Ls[presetLower] = object
      l = presetLower
    }
    // 存在'zh-cn'，'zh-hk'的情况，只取前面的zh作为属性
    const presetSplit = preset.split('-')
    if (!l && presetSplit.length > 1) {
      return parseLocale(presetSplit[0])
    }
  } else {
    const { name } = preset
    Ls[name] = preset
    l = name
  }
  if (!isLocal && l) L = l
  return l || (!isLocal && L)
}
```

根据传递的preset类型做不同的分支操作，最后返回配置的语言字符串

1. 未传递preset时，使用默认语言（**en**）
2. preset为**字符串**时，会将其统一转化为小写，根据preset和object参数的传递情况来判断是否有新的自定义配置语言
3. preset为**对象**时则取**name**属性

::: tip
因此parseLocale()有两种使用方法

```javascript
parseLocale('zh-cn', {
  //
}, true)

parseLocale({
  name: 'zh-cn',
  //
}, null, true)
```

:::

### 解析传递的date

```javascript
const parseDate = (cfg) => {
  const {
    date,
    utc
  } = cfg
  if (date === null) return new Date(NaN) // null is invalid
  if (Utils.u(date)) return new Date() // today
  if (date instanceof Date) return new Date(date)
  if (typeof date === 'string' && !/Z$/i.test(date)) {
    const d = date.match(C.REGEX_PARSE)
    if (d) {
      const m = d[2] - 1 || 0
      const ms = (d[7] || '0').substring(0, 3)
      if (utc) {
        return new Date(Date.UTC(d[1], m, d[3]
          || 1, d[4] || 0, d[5] || 0, d[6] || 0, ms))
      }
      return new Date(d[1], m, d[3]
        || 1, d[4] || 0, d[5] || 0, d[6] || 0, ms)
    }
  }

  return new Date(date) // everything else
}
```

根据传递的date类型做不同的分支操作，最后返回解析后的时间

1. 为**null**时，则直接返回new Date(NaN)，也就是**Invalid Date**
2. 为**undefined**时，返回当天时间
3. 为**Date对象**时，则使用new Date()包装后返回
4. 为**字符串**并且字符串结尾不为*Z*时（使用当地时间而不使用**格林尼治时间**），使用正则表达式拆解时间，解析**月份**从**0**开始因此需要-1，拆解时间的正则表达式对于毫秒的不限制输入长度因此这里直接截取了**前三位**，而在new
   Date()中毫秒只能输入三位，不然就是**Invalid Date**，
   由于除了年份其他都是**可选项**，所以需要定义可能不存在的数组元素时的默认值，最后根据是否使用**UTC**来返回对应解析后的date。若都不符合条件，则交给new Date()来解析

#### 拆解时间的正则表达式

```javascript
export const REGEX_PARSE = /^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/
```

- 仅能够输入数字，除了年份其他都是可选的
- 年月日可用 -或/ 连接
- 月日时分秒可输入数字 1或01
- 年月日与时分秒中间的空挡可用 T或t或空格 连接
- 毫秒不限制长度，可用 .或:

::: tip
T/t 是日期与时间的分隔符，与空格一样，并无区别
:::

## dayjs().set()

```javascript
class Dayjs {
    // ...
   $set(units, int) { // private set
      const unit = Utils.p(units)
      const utcPad = `set${this.$u ? 'UTC' : ''}`
      const name = {
         [C.D]: `${utcPad}Date`,
         [C.DATE]: `${utcPad}Date`,
         [C.M]: `${utcPad}Month`,
         [C.Y]: `${utcPad}FullYear`,
         [C.H]: `${utcPad}Hours`,
         [C.MIN]: `${utcPad}Minutes`,
         [C.S]: `${utcPad}Seconds`,
         [C.MS]: `${utcPad}Milliseconds`
      }[unit]
      const arg = unit === C.D ? this.$D + (int - this.$W) : int

      if (unit === C.M || unit === C.Y) {
         // clone is for badMutable plugin
         const date = this.clone().set(C.DATE, 1)
         date.$d[name](arg)
         date.init()
         this.$d = date.set(C.DATE, Math.min(this.$D, date.daysInMonth())).$d
      } else if (name) this.$d[name](arg)

      this.init()
      return this
   }

   set(string, int) {
      return this.clone().$set(string, int)
   }
   // ...
}

const prettyUnit = (u) => {
   const special = {
      M: C.M,
      y: C.Y,
      w: C.W,
      d: C.D,
      D: C.DATE,
      h: C.H,
      m: C.MIN,
      s: C.S,
      ms: C.MS,
      Q: C.Q
   }
   return special[u] || String(u || '').toLowerCase().replace(/s$/, '')
}
```

根据传入的单位做统一转化，可传入缩写或全称或全称的复数

::: tip
```javascript
// 这三种是一样的
dayjs().set('d', 3)
dayjs().set('day', 3)
dayjs().set('days', 3)
```
:::

随后根据用户是否为**UTC**模式来定义对应的方法映射，如普通模式传入'd'，则使用setDate，**UTC**下则使用setUTCDate

若用户传入的单位为d（day/days）时则会将传入的值参数int做一遍转化后赋值给arg

::: tip
假设为
```javascript
dayjs('2023-01-10').set('day', 10)
```
此时参数int为10，根据代码可得$D为10 + ((int的值为10) - (1月10号为周2所以$W为2)) = 18，也就是设置为18号

直观的理解可以是int = 10 - (一周的天数7) = 1周余三，也就是下一周的周三

只要是在1月10号这一周范围内，不论是1月10号还是1月11号，最后得到的都是1月18号
:::

接下来判断当用户传入的单位为y（years/year）或M（month/months）时会做额外转化，目的是为了防止出现如当日期为2023-01-31时，增加一个月会变成2023-03-03而不是2023-02-28
，其他单位则正常使用对应的setXXX方法

转化完成后重新初始化并返回当前实例可供链式调用
