# vuex-persistedstate 源码阅读

### 一个持久化缓存store数据的vuex插件

---

```typescript
import { Store, MutationPayload } from "vuex";
import merge from "deepmerge";
import * as shvl from "shvl";

interface Storage {
  getItem: (key: string) => any;
  setItem: (key: string, value: any) => void;
  removeItem: (key: string) => void;
}

interface Options<State> {
  key?: string;
  paths?: string[];
  reducer?: (state: State, paths: string[]) => object;
  subscriber?: (
    store: Store<State>
    ) => (handler: (mutation: any, state: State) => void) => void;
  storage?: Storage;
  getState?: (key: string, storage: Storage) => any;
  setState?: (key: string, state: any, storage: Storage) => void;
  filter?: (mutation: MutationPayload) => boolean;
  arrayMerger?: (state: any[], saved: any[]) => any;
  rehydrated?: (store: Store<State>) => void;
  fetchBeforeUse?: boolean;
  overwrite?: boolean;
  assertStorage?: (storage: Storage) => void | Error;
}

export default function <State>(
  options?: Options<State>
): (store: Store<State>) => void {
  options = options || {};

  // 使用持久化缓存的方式，默认使用localStorage
  // 使用cookies时需要传入上述定义的interface Storage一样的类型
  const storage = options.storage || (window && window.localStorage);
  // 存储在内存中的key名，默认 vuex
  const key = options.key || "vuex";

  // 根据不同的类型来处理返回不同的结果，使用try catch的目的是为了JSON.parse解析某些数据类型报错
  function getState(key, storage) {
    const value = storage.getItem(key);

    try {
      return (typeof value === "string")
        ? JSON.parse(value) : (typeof value === "object")
        ? value : undefined;
    } catch (err) {}

    return undefined;
  }

  function filter() {
    return true;
  }

  function setState(key, state, storage) {
    return storage.setItem(key, JSON.stringify(state));
  }

  // 使用shvl.js根据paths(如'a.b.c')转化为以对象的键值对来显示，未传递则使用state
  // 类似于lodash.set()  
  // https://www.npmjs.com/package/shvl  
  function reducer(state, paths) {
    return Array.isArray(paths)
      ? paths.reduce(function (substate, path) {
          return shvl.set(substate, path, shvl.get(state, path));
        }, {})
      : state;
  }
  
  function subscriber(store) {
    return function (handler) {
      return store.subscribe(handler);
    };
  }

  // 断言Storage的Api是否可正常使用
  // 若自定义Storage没有定义约定好的Api或浏览器不支持则必定报错  
  const assertStorage =
    options.assertStorage ||
    (() => {
      storage.setItem("@@", 1);
      storage.removeItem("@@");
    });

  assertStorage(storage);
  
  const fetchSavedState = () => (options.getState || getState)(key, storage);

  let savedState;
  
  // 若指定fetchBeforeUse为true时，将会在调用此函数时，先从storage中获取数据，默认false
  if (options.fetchBeforeUse) {
    savedState = fetchSavedState();
  }

  return function (store: Store<State>) {
    // 若未指定fetchBeforeUse时则只在插件被Vuex调用时获取  
    if (!options.fetchBeforeUse) {
      savedState = fetchSavedState();
    }
    // 若已存在数据，会根据overwrite属性来重写state或者合并state
    // 若指定了arrayMerge函数则使用自定义arrayMerge函数，否则则使用deepmerge的默认合并数组逻辑
    // 这里就是刷新浏览器后storage自动存储到vuex的地方  
    // https://www.npmjs.com/package/deepmerge  
    if (typeof savedState === "object" && savedState !== null) {
      store.replaceState(
        options.overwrite
          ? savedState
          : merge(store.state, savedState, {
              arrayMerge:
                options.arrayMerger ||
                function (store, saved) {
                  return saved;
                },
              clone: false,
            })
      );
      // 根据官方文档说明这个api一般用于SSR渲染，具体可以参考官方文档
      (options.rehydrated || function () {})(store);
    }
    
    // 当vuex内触发了mutation时则会触发setState
    // 这样就不需要手动去storage.setItem('xxx')  
    (options.subscriber || subscriber)(store)(function (mutation, state) {
      // 根据用户是否传入filter来过滤一些不需要的操作  
      if ((options.filter || filter)(mutation)) {
        (options.setState || setState)(
          key,
          (options.reducer || reducer)(state, options.paths),
          storage
        );
      }
    });
  };
}

```
