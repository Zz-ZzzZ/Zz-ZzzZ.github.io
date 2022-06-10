# 小册Typescript类型体操通关秘籍的实用泛型工具类分享

***

获取数组内第一项
```typescript
type GetFirst<Arr extends unknown[]> = 
  Arr extends [infer First, ...unknown[]] ? First : never;
```

获取数组内最后一项
```typescript
type GetLast<Arr extends unknown[]> = 
  Arr extends [...unknown[], infer Last] ? Last : never;
```

一串字符是否存在与某个字符串
```typescript
type StartsWith<Str extends string, Prefix extends string> =
  Str extends `${Prefix}${string}`
  ? true
  : false;
```

String.Replace在Ts中的实现
```typescript
type ReplaceStr<Str extends string,
  SearchValue extends string,
  ReplaceValue extends string,
  > = Str extends `${infer Prefix}${SearchValue}${infer Suffix}`
  ? `${Prefix}${ReplaceValue}${Suffix}`
  : Str;
```

数组反转
```typescript
type ReverseArray<T extends unknown[]> = T extends [infer First, ...infer Rest]
  ? [...ReverseArray<Rest>, First]
  : T;
```

将字符串的字符转化为联合类型
```typescript
type StringToUnion<Str extends string> = Str extends `${infer First}${infer Rest}`
  ? First | StringToUnion<Rest>
  : never;
```
