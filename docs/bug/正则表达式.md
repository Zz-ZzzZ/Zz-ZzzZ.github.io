# 正则表达式（/g修饰符）踩坑分享 

***

在书写正则表达式时，有一个常用的符号'/g'代表在该字符串中进行全局搜索，常用方法test()或在String.replace()中做匹配替换文本，
非常的方便
```javascript
const regExp = /ab/g;
```

在某种需求下，我对这个正则调用了两次
```javascript
console.log(regExp.test('abc'));
console.log(regExp.test('abc'));
```

结果会是什么，两次true？刚开始我也是这么认为的，执行一下
```javascript
// 得到了
true
false
```

为什么会出现此错误，根据mdn文档中对正则表达式的lastIndex属性的描述
> 只有正则表达式使用了表示全局检索的 "g" 或者粘性检索的 "y" 标志时，该属性才会起作用。此时应用下面的规则：<br>
> - 如果 lastIndex 大于字符串的长度，则 regexp.test 和 regexp.exec 将会匹配失败，然后 lastIndex 被设置为 0。
> - 如果 lastIndex 等于或小于字符串的长度，则该正则表达式匹配从 lastIndex 位置开始的字符串。
>   - 如果 regexp.test 和 regexp.exec 匹配成功，lastIndex 会被设置为紧随最近一次成功匹配的下一个位置。
>   - 如果 regexp.test 和 regexp.exec 匹配失败，lastIndex 会被设置为 0

由这句话
> 如果 regexp.test 和 regexp.exec 匹配成功，lastIndex 会被设置为紧随最近一次成功匹配的下一个位置。

可以得到，在第一次调用结束并匹配成功后，下标（lastIndex）并不会回到0，测试一下


```javascript
true
2
false
```

可以看到，在第一次调用test()后，lastIndex停在了2这个位置，也就是下一次调用test()时，lastIndex将从2开始，
所以第二次调用test()时会得到false，如果想要返回结果都是true，那么可以手动将lastIndex重置为0

```javascript
if (regExp.lastIndex) {
  regExp.lastIndex = 0;
}
```

再次执行后，查看执行结果
```javascript
true
0
true
```

由此可见，下标又回到了0，第二次调用test()则匹配成功

***

如果想不用多次调用时都要重置为0的情况下，可以不使用/g或/y符号，也可以将表达式放在函数内，
使函数每次调用时都是重新定义正则表达式， 也就不存在下标还是上一次调用的情况
