# TanStack Query 入门食用指南

对常见的请求场景进行一个封装，可以跨组件的管理请求状态，并且支持多个框架版本。

由于V5版本只有纯英文文档，因此在进行阅读后记录它的基本用法，哪天用到了可以快速使用。

本篇记录的是`react-query`的用法，其它版本大差不差。

### QueryClient && QueryClientProvider

```tsx
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App/>
    </QueryClientProvider>
  </React.StrictMode>,
)
```

实例化`QueryClient`类，并使用`QueryClientProvider`组件注入后，所有子组件就可以通过`useQueryClient`来进行跨组件操作。

### useQuery

`query`一般用于`get`请求的场景，页面加载就可以发起请求。

```typescript
const [enabled, setEnabled] = useState(false)

const { isPending, isFetching, isLoading, data, refetch } = useQuery({
  // 这里可以放不同的数据类型，一般可以将组件的state放进去
  queryKey: ['useQuery'],
  // 这里会传入一些参数
  queryFn: ({ queryKey }) => axios().then((response) => {
    // 这里需要自行处理response得到的数据，最后就会放到data中
    return response
  }),
  enabled,
  placeholderData: keepPreviousData,
  initialData: initialData
})
```

- `queryFn`为请求函数，无论是使用`fetch`还是`axios`只要是返回`Promise`都可以使用。在调用`queryFn`时，`queryKey`会作为参数上下文中的`queryKey`传给`queryFn`。
当需要将请求状态更改为`error`状态时可以在`Promise`内返回`reject`或`throw new Error`。

- `queryKey`可以用于在其它地方通过`queryClient`调用或通过其定义的`queryKey`在变更时重新发起请求，`queryKey`的数组内支持数字，字符串以及可序列化的对象。

- `useQuery`会返回请求的状态以及数据源，这里需要注意`isPending`和`isFetching`的区别，`isPending`和`devtools/network`的`pending`不同，
它代表的是数据的获取状态，`isFetching`才是请求的状态。`isLoading`是`isPending && isFetching`的计算值，一般用于惰性发起请求。

#### 惰性请求

- 当需要惰性（也可以说是根据条件决定）发起请求时，可以定义`enabled`为组件的`state`，然后将`state`放入`queryKey`当中，也可以从`useQuery`内使用`refetch`来手动发起请求，不过官方并不推荐手动发起。

#### 分页场景

- 在分页场景下，可以定义`placeholderData`属性，可以使用自带的`keepPreviousData`或自定义返回值，这样在切换分页时，在新数据获取之前，可以保留旧的数据。
这个属性可以理解为分页场景下的`placeholder`。

#### 初始数据

- 如果想在发起请求之前放一些假数据或从其它地方得到的数据在那，那么可以定义`initialData`，数据类型要和`data`内的相同，支持直接定义或函数返回。

### useInfiniteQuery

```typescript
const { data, fetchNextPage, fetchPreviousPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['infinite'],
  queryFn: ({ pageParam }) => axios(pageParam).then((res) => res.data),
  initialPageParam: {
    page: 1,
    size: 10
  },
  getNextPageParam: (lastPage, allPage, pageParam) => {
    // 在此返回下一页的pageParam
  },
  getPreviousPageParam: () => {
    // 用法与getNextPageParam一致，但不是必填项
  }
})
```

- `queryKey`与`queryFn`和`useQuery`的用法基本一致，不过`queryFn`中多了一个`pageParam`参数可供使用。

- 使用`useInfiniteQuery`时必须传入`initialPageParam`和`getNextPageParam`。`initialPageParam`为发起请求的初始值，一般为页码和页数或只有页码。
`getNextPageParam`用于获取下一页数据（如调用了`fetchNextPage`）时的`pageParam`，如果后端提供了`下一页`的字段，那么可以直接使用，若未提供则需要手动对页数进行`+1`。

- `hasNextPage`是`getNextPageParam`返回值，不为`undefined`或`null`时都为`true`。

- 对应`NextPage`，`useInfiniteQuery`也提供了`getPreviousPageParam`以及其它和`NextPage`相似的功能，不过需要注意的是，`getPreviousPageParam`不是获取上一页，而是从头部插入数据。

- 在`data`上和`useQuery`不同，`data`则变为一个对象，包含`page`和`pageParams`，前者是请求获取的数据源，后者则是每次`Next`或`Previous`所得到的`pageParam`

- 需要注意的是这里的`page`是由每一次获取到的数据一起拼接而成，是一个二维或多维数组，在使用时需注意使用方式。

```tsx
{
  data?.pages.map((group, index) => (
    <Fragment key={index}>
      {/*这里才是请求到的数据*/}
      {group.map((item) => <p key={item.value}>{item.label}</p>)}
    </Fragment>
  ))
}
```

### useMutation

常用于`post`场景，需手动发起。

```typescript
const { mutateAsync, mutate, isPending, isSuccess } = useMutation({
  mutationKey: ['useMutation'],
  mutationFn: (params) => axios(params),
  onMutate: () => {},
  onSuccess: () => {},
  onError: () => {},
  onSettled: () => {}
})
```

- `mutationKey`与`mutationFn`和`query`中的用法基本一致，`mutationFn`的参数来自于`mutate`或`mutateAsync`传递的值。

- `useMutation`具有独特的回调事件，`onMutate`可以理解为发起请求前需要进行的操作，其余三个回调事件可以对应理解为`Promise`中的`then`，`catch`，`finally`。

- `mutate`与`mutateAsync`的使用方法一致，区别是若想触发`useMutation`上定义的回调之外的其他回调，`mutateAsync`可以向使用`Promise`那样注册`then/catch/finally`，
而`mutate`需要作为第二个参数传入其回调事件。

```typescript
mutate(params, {
  onSuccess: () => {},
  onError: () => {},
  onSettled: () => {}
})
```
