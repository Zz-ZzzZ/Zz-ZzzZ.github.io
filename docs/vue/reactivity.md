# Reactivity

### 学习 B 站手写 Vue3 源码的笔记

---

### reactive

```typescript
const obj = reactive({ name: 'obj' });
```

1. 创建 reactive 时，调用一个统一封装好的函数 **createReactiveObject()**
2. **createReactiveObject()** 内部实现了对 target，也就是 obj 的**Proxy**代理，其中使用了 **reactiveMap(weakMap)** 来缓存已经存在过的 target
3. 之后在**Proxy**使用了**baseHandlers**内封装好的**get/set**，
   在**get**中使用 **track()** 收集依赖，在**set**中使用 **trigger()** 来触发依赖
4. **get/set**中都使用了 **Reflect** 这个 Api 对 target 来进行**get/set**

---

### ref

```typescript
const ref1 = ref(0);
const ref2 = ref({ a: 1 });
```

1. 创建 ref 时，会进行数据类型判断，若为基本数据类型则返回，若为引用类型则会转化为 reactive
2. ref 使用的是 **get value**/**set value** 形式，在 get 中使用 trackRefValue()收集依赖
3. 在 set 中在判断新值和旧值 **(两个值均是原始值，不是被转化后的值)** 不相同后使用 triggerRefValue()触发依赖

---

### computed

```typescript
const obj = reactive({ name: 'obj' });
const test = computed(() => obj.name);
test.value;
```

1.  创建 computed 时，会返回一个实例化后的**ComputedRefImpl**类，在**ComputedRefImpl**
    类实例化期间会初始化几个内部变量，computed 的值以 test.value 来访问

    > 1. **\_dirty** -- 用于判断有无改变是否需要重新获取，也就是缓存
    > 2. **dep** -- 存放的 ReactiveEffect 类
    > 3. **effect** -- 实例化一个新的 ReactiveEffect 类，并将 computed 填入的 Function 作为 ReactiveEffect 类的 fn 参数，并定义了 scheduler，用于 computed 内部依赖的变量更改后重新计算

2.  访问 test.value 后，将会尝试收集依赖，在此只是简单访问将不会收集依赖 **（只有 value 在某个 ReactiveEffect.run()下才会收集，如 effect[这里的 effect 是一个 api](() => test.value)）**
3.  随后检查\_dirty 的值判断是否需要获取其值，
    在此第一次访问时，\_dirty 为 true 将会执行 this.effect 内的 run()方法，而 run()方法会执行
    实例化 ReactiveEffect 类时传入的 fn 参数也就是() => obj.name,得到了 run()返回结果'obj'后返回

4.  而在调用 run()方法时，访问到了 reactive 创建的 obj.name 的 getter，会调用 track()进行依赖收集，在 track()函数内会寻找当前的 activeEffect，而 activeEffect 就是
    调用 run()方法时的那个 ReactiveEffect 类也就是 this.effect
5.  当改变了 obj.name，则会触发 trigger()，trigger()内会寻找有无定义 scheduler，
    而 scheduler 在 obj.name 的 getter 阶段就存好了

---

### watch

```typescript
const obj = reactive({ name: 'obj' });
watch(
  () => obj.name,
  (newValue, oldValue, onCleanup) => {
    // 这一次id为1，下一次为2
    const token = performAsyncOperation(id.value);
    onCleanup(() => {
      // 这里会保存id为1的token，若watch再一次触发，id变为2时，会触发保存id为1的token
      token.cancel();
    });
  },
);
```

> watch 有两个参数，第一个参数是监听的源，数据源可以是返回值的 getter **函数**，也可以直接是 **ref/reactive**。
> 第二个参数则是数据变动时的回调，可得到新值、旧值、数据变动时需要做的操作（常用于异步情况，如 token.cancel()）

1. 创建 watch 时会判断数据源是否是一个函数类型，若为非函数类型并且为 ref/reactive 类型时，将会将其 **(若为 ref 类型则取.value)** 包装成一个 getter 函数,若为函数则直接使用
2. 定义 onCleanup 函数，onCleanup 有一个 **fn** 参数，将 onCleanup 作为 callback 的参数传入后，用户执行了 onCleanup 并且传入了 **fn**，onCleanup 将会**保存** fn 并且**再次**触发 watch 时将会调用保存的 fn
3. 定义 job，job 内部会调用用户传入的 watch 的 callback 并将保存的旧值和重新获取的新值还有定义的 onInvalidate 作为参数传入 callback，并作为 ReactiveEffect 的第二个参数，数据变动时将会触发
4. 实例化 ReactiveEffect 类，将被包装过后的数据源和 job 传入，并调用 run()方法获取旧值，获取新值则是在 job 内再调一次 run()

---

### toRef/toRefs

```typescript
const obj = reactive({ name: 'obj' });
const nameRef = toRef(obj, 'name');
const { name } = toRefs(obj);
```

1. 创建 toRef 时，将会实例化 **ObjectRefImpl** 类，**ObjectRefImpl** 类接收原 **reactive** 和对应的属性，**ObjectRefImpl** 类实际的作用是包装一层 **get/set**,
   get 则访问 reactive 中的属性，set 则对应更改原 reactive 中的属性
2. 创建 toRefs 时，创建一个 result 变量，根据参数是数组类型还是对象类型进行不同的循环调用 toRef()储存
3. 实际访问 **nameRef.value** 和 **name.value** 就是访问 **obj.name**

---

### toRaw

```typescript
const obj = reactive({
  name: 'obj'
})
const objRaw = toRaw(obj) // { name: 'obj' }
```

1. 在使用toRaw时，会访问参数内的属性 **__v_raw**，若为**reactive**或**readonly**的代理对象，则会触发对应的getter，若为一个普通对象，则不会触发getter
2. 触发了getter后，getter内做了对访问 **__v_raw**属性时的判断，会从缓存的map中取出对应的值并返回
3. 拿到了返回值后储存在变量raw并做判断，如果不是undefined，代表这是一个**reactive**或**readonly**的代理对象，那么递归调用，直到raw是undefined，代表是一个普通对象，返回该普通对象
