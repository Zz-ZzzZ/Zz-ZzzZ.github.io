# Reactivity

### B站手写Vue3源码笔记

---

### reactive
```typescript
const obj = reactive({ name: 'obj' });
```

1. 创建reactive时，调用一个统一封装好的函数 **createReactiveObject()**
2. **createReactiveObject()** 内部实现了对 target，也就是 obj 的**Proxy**代理，其中使用了**reactiveMap(weakMap)**来缓存已经存在过的 target
3. 之后在**Proxy**使用了**baseHandlers**内封装好的**get/set**，
在**get**中使用 **track()** 收集依赖，在**set**中使用 **trigger()** 来触发依赖
4. **get/set**中都使用了 **Reflect** 这个 Api 对 target 来进行**get/set**

*** 

### computed

```typescript
const obj = reactive({ name: 'obj' });
const test = computed(() => obj.name);
test.value
```

1. 创建computed时，会返回一个实例化后的**ComputedRefImpl**类，在**ComputedRefImpl**
类实例化期间会初始化几个内部变量，computed的值以test.value来访问
   > 1. **_dirty** -- 用于判断有无改变是否需要重新获取，也就是缓存
   > 2. **dep** -- 存放的 ReactiveEffect类
   > 3. **effect** -- 实例化一个新的 ReactiveEffect类，并将computed填入的Function作为ReactiveEffect类的fn参数，
      并定义了scheduler，用于computed内部依赖的变量更改后重新计算

2. 访问test.value后，将会尝试收集依赖，在此只是简单访问将不会收集依赖 **（只有value在某个ReactiveEffect.run()下才会收集，如effect[这里的effect是一个api](() => test.value)）**
3. 随后检查_dirty的值判断是否需要获取其值，
在此第一次访问时，_dirty为true 将会执行this.effect内的run()方法，而run()方法会执行
实例化ReactiveEffect类时传入的fn参数也就是() => obj.name,得到了run()返回结果'obj'后返回

4. 而在调用run()方法时，访问到了reactive创建的obj.name的getter，会调用track()进行依赖收集，在track()函数内会寻找当前的activeEffect，而activeEffect就是
调用run()方法时的那个ReactiveEffect类也就是this.effect
5. 当改变了obj.name，则会触发trigger()，trigger()内会寻找有无定义scheduler，
而scheduler在obj.name的getter阶段就存好了


