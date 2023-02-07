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

根据传入的单位做统一转化，可传入缩写或全称或复数

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


## dayjs().get()

```javascript
class Dayjs {
    // ...
   get(unit) {
      return this[Utils.p(unit)]()
   }

   $g(input, get, set) {
      if (Utils.u(input)) return this[get]
      return this.set(set, input)
   }
   // ...
}

const proto = Dayjs.prototype
dayjs.prototype = proto;
[
   ['$ms', C.MS],
   ['$s', C.S],
   ['$m', C.MIN],
   ['$H', C.H],
   ['$W', C.D],
   ['$M', C.M],
   ['$y', C.Y],
   ['$D', C.DATE]
].forEach((g) => {
   proto[g[1]] = function (input) {
      return this.$g(input, g[0], g[1])
   }
})
```

在**导入**Dayjs模块时，Dayjs内部会在**原型链**上**挂载**以日期单位为属性，并且**支持修改**对应日期的方法，在get方法中**只能**获取对应的日期

::: tip
所以在修改日期时也可以使用原型链上的方法，**建议还是使用set()**
```javascript
// 两者是一样的
dayjs().day(10)
dayjs().set('day', 10)
```
:::

在使用get方法时传入的单位实际就是访问挂载在原型链上的对应方法， get方法内部会对传入的单位进行转化，因此也支持缩写和复数

## dayjs().format()

```javascript
class Dayjs {
   // ... 
   format(formatStr) {
      const locale = this.$locale()

      if (!this.isValid()) return locale.invalidDate || C.INVALID_DATE_STRING
      // export const FORMAT_DEFAULT = 'YYYY-MM-DDTHH:mm:ssZ'
      const str = formatStr || C.FORMAT_DEFAULT
      const zoneStr = Utils.z(this)
      const { $H, $m, $M } = this

      const {
         weekdays, months, meridiem
      } = locale

      // 获取字符串的短名称
      const getShort = (arr, index, full, length) => (
              (arr && (arr[index] || arr(this, str))) || full[index].slice(0, length)
      )
      
      // 格式化小时，是否需要带0
      const get$H = num => (
              Utils.s($H % 12 || 12, num, '0')
      )

      // 格式化小时是否为AM/PM/am/pm
      const meridiemFunc = meridiem || ((hour, minute, isLowercase) => {
         const m = (hour < 12 ? 'AM' : 'PM')
         return isLowercase ? m.toLowerCase() : m
      })

      const matches = {
         // 截取年份最后两位 2023 => 23 
         YY: String(this.$y).slice(-2),
         YYYY: this.$y,
         // 月份从0开始
         M: $M + 1,
         MM: Utils.s($M + 1, 2, '0'),
         // 获取月份缩写 september => sep
         MMM: getShort(locale.monthsShort, $M, months, 3),
         // 获取月份全称
         MMMM: getShort(months, $M),
         D: this.$D,
         DD: Utils.s(this.$D, 2, '0'),
         d: String(this.$W),
         // 获取星期缩写 monday => mo
         dd: getShort(locale.weekdaysMin, this.$W, weekdays, 2),
         // 获取星期缩写 monday => mon
         ddd: getShort(locale.weekdaysShort, this.$W, weekdays, 3),
         // 获取星期全称
         dddd: weekdays[this.$W],
         H: String($H),
         HH: Utils.s($H, 2, '0'),
         h: get$H(1),
         hh: get$H(2),
         // am/pm
         a: meridiemFunc($H, $m, true),
         // AM/PM
         A: meridiemFunc($H, $m, false),
         m: String($m),
         mm: Utils.s($m, 2, '0'),
         s: String(this.$s),
         ss: Utils.s(this.$s, 2, '0'),
         SSS: Utils.s(this.$ms, 3, '0'),
         // 当前地区的时差
         Z: zoneStr // 'ZZ' logic below
      }
      // export const REGEX_FORMAT = /\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g
      return str.replace(C.REGEX_FORMAT, (match, $1) => $1 || matches[match] || zoneStr.replace(':', '')) // 'ZZ'
   }
   // ...
}

// Utils.s
// 当字符串小于指定长度时可以拼接上需要拼接的字符
const padStart = (string, length, pad) => {
   const s = String(string)
   if (!s || s.length >= length) return string
   return `${Array((length + 1) - s.length).join(pad)}${string}`
}
```

获取语言后检查解析的日期格式是否正确，若未传递参数则使用默认的格式化规则，然后定义每个日期单位解析的映射，最后通过replace方法返回完成格式化后的字符串。

这里的主要点是使用replace方法中第二个参数以函数形式，可以进行多次匹配，并且可以返回不同情况下的结果

::: tip 为什么第二个参数使用函数形式 -- [MDN](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/String/replace)
`replace()` 方法返回一个由替换值（`replacement`）替换部分或所有的模式（`pattern`）匹配项后的新字符串。模式可以是一个字符串或者一个正则表达式，替换值可以是一个字符串或者一个每次匹配都要调用的回调函数。**如果`pattern`是字符串，则仅替换第一个匹配项。**
:::

::: tip 指定一个函数作为参数 -- [MDN](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/String/replace#描述)
你可以指定一个函数作为第二个参数。在这种情况下，当匹配执行后，该函数就会执行。**函数的返回值作为替换字符串。** (注意：上面提到的特殊替换参数在这里不能被使用。) 另外要注意的是，**如果第一个参数是正则表达式，并且其为全局匹配模式，那么这个方法将被多次调用，每次匹配都会被调用。**
:::

函数内的第二个参数$1用于匹配`[([^\]]+)]` 个人猜测这个匹配规则可以将`dayjs('2023-01-31').format('[现在时间：] YYYY-MM-DD')`转化为 `现在时间：2023-01-31`

::: tip $1是什么 -- [MDN](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/String/replace#描述)
假如 replace() 方法的第一个参数是一个RegExp 对象，则代表第 n 个**括号匹配的字符串**。（对应于上述的$1，$2 等。）例如，如果是用 /(\a+)(\b+)/ 这个来匹配，p1 就是匹配的 \a+，p2 就是匹配的 \b+。
:::

## dayjs().add() | dayjs().subtract()

```javascript
class Dayjs {
   // ... 
   add(number, units) {
      number = Number(number) // eslint-disable-line no-param-reassign
      const unit = Utils.p(units)
      const instanceFactorySet = (n) => {
         const d = dayjs(this)
         return Utils.w(d.date(d.date() + Math.round(n * number)), this)
      }
      if (unit === C.M) {
         return this.set(C.M, this.$M + number)
      }
      if (unit === C.Y) {
         return this.set(C.Y, this.$y + number)
      }
      if (unit === C.D) {
         return instanceFactorySet(1)
      }
      if (unit === C.W) {
         return instanceFactorySet(7)
      }
      const step = {
         [C.MIN]: C.MILLISECONDS_A_MINUTE,
         [C.H]: C.MILLISECONDS_A_HOUR,
         [C.S]: C.MILLISECONDS_A_SECOND
      }[unit] || 1 // ms

      const nextTimeStamp = this.$d.getTime() + (number * step)
      return Utils.w(nextTimeStamp, this)
   }
   // ...
}

// Utils.w
const wrapper = (date, instance) =>
        dayjs(date, {
           locale: instance.$L,
           utc: instance.$u,
           x: instance.$x,
           $offset: instance.$offset // todo: refactor; do not use this.$offset in you code
        })
```

将传入的值统一转化为数字类型，并获取传入的单位，年份和月份的增加直接使用`set()`方法，日与星期则使用定义的工厂函数来修改，
时分秒则使用时间戳形式修改，最后返回重新包装后的实例

::: tip instanceFactorySet()
从git历史提交记录上看,原本日与星期与时分秒均使用**时间戳**来进行增加,在其他地区用户的不同令时会导致`add()`无效,具体查看[PR](https://github.com/iamkun/dayjs/pull/319)
:::

`subtract()`则是将出传入的值改为负数并调用`add()`
