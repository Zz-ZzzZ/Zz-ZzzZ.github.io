# scanDirs

## 分析动态依赖导出关系

先来分析用户提供的依赖路径

### scanDirs()

```typescript
async function scanDirs() {
  if (dirs?.length) {
    // 调用完此函数后会将解析的import规则全部放入ctx.dynamicImports中
    await unimport.modifyDynamicImports(async (imports) => {
      const exports_ = await scanDirExports(dirs, {
        filePatterns: ['*.{tsx,jsx,ts,js,mjs,cjs,mts,cts}'],
      }) as ImportExtended[]

      exports_.forEach(i => i.__source = 'dir')
      return modifyDefaultExportsAlias([
        ...imports.filter((i: ImportExtended) => i.__source !== 'dir'),
        ...exports_,
      ], options)
    })
  }
  writeConfigFilesThrottled()
}
```

若指定了动态依赖的路径则会调用来自`createUnimport()`内提供的`modifyDynamicImports`方法。

在`scanDirExports`完成后将其所有的成员都添加了属性`__source`并赋值`dir`最后返回`modifyDefaultExportsAlias`的执行结果，这里入参会对`imports`进行过滤，
目的是为了过滤之前已经扫描过的文件。

在`callback`内调用并储存`scanDirExports`的返回值，其中传入了自定义的文件过滤规则


最后创建将配置文件输出。

### modifyDynamicImports()

```typescript
async function modifyDynamicImports (fn: (imports: Import[]) => Thenable<void | Import[]>) {
  const result = await fn(ctx.dynamicImports)
  if (Array.isArray(result)) {
    ctx.dynamicImports = result
  }
  ctx.invalidate()
}
```

函数内会储存来自`callback`的返回值，若有值则储存在`dynamicImports`内，然后重置`_combinedImports`属性也就是调用`invalidate()`，接下来回到上面定义的`callback`内。

### scanDirExports()

```typescript
export async function scanDirExports (dir: string | string[], options?: ScanDirExportsOptions) {
  const files = await scanFilesFromDir(dir, options)
  const fileExports = await Promise.all(files.map(i => scanExports(i)))
  return fileExports.flat()
}
```

在`scanDirExports`内，将`scanFilesFromDir`的返回值储存再逐一调用`scanExports`后进行扁平化数组再返回，继续进入`scanFilesFromDir`内。

### scanFilesFromDir()

```typescript
export async function scanFilesFromDir (dir: string | string[], options?: ScanDirExportsOptions) {
  const dirs = (Array.isArray(dir) ? dir : [dir]).map(d => normalize(d))

  const fileFilter = options?.fileFilter || (() => true)
  const filePatterns = options?.filePatterns || ['*.{ts,js,mjs,cjs,mts,cts}']

  const result = await Promise.all(
    // Do multiple glob searches to persist the order of input dirs
    dirs.map(async i => await fg(
      [i, ...filePatterns.map(p => join(i, p))],
      {
        absolute: true,
        cwd: options?.cwd || process.cwd(),
        onlyFiles: true,
        followSymbolicLinks: true
      })
      .then(r => r
        .map(f => normalize(f))
        .sort()
      )
    )
  )

  return Array.from(new Set(result.flat())).filter(fileFilter)
}
```

在`scanFilesFromDir`内，将`dir`统一转化为数组并将其路径**规范化**，定义变量`fileFilter`储存是否传入了`fileFilter`选项，
定义变量`filePatterns`储存是否传入了自定义规则，在**callback**中传入了`['*.{tsx,jsx,ts,js,mjs,cjs,mts,cts}']`。

接下来使用`fast-glob`来扫描`dir`下的所有文件，得到返回值后会进行**路径规范化、排序、去重、扁平化、过滤**后返回。

此时得到的数据应为：

```
[
  'D:/WebstormProjects/unplugin-auto-import/examples/vite-react/src/layouts/MainLayout.tsx',
  'D:/WebstormProjects/unplugin-auto-import/examples/vite-react/src/views/PageA.tsx',
  'D:/WebstormProjects/unplugin-auto-import/examples/vite-react/src/views/PageB.tsx'
]
```

接下来来看一下`scanExports`内。

### scanExports()

```typescript
export async function scanExports (filepath: string, seen = new Set<string>()): Promise<Import[]> {
  if (seen.has(filepath)) {
    // eslint-disable-next-line no-console
    console.warn(`[unimport] "${filepath}" is already scanned, skipping`)
    return []
  }

  seen.add(filepath)
  const imports: Import[] = []
  const code = await readFile(filepath, 'utf-8')
  const exports = findExports(code)
  const defaultExport = exports.find(i => i.type === 'default')

  if (defaultExport) {
    let name = parsePath(filepath).name
    if (name === 'index') {
      name = parsePath(filepath.split('/').slice(0, -1).join('/')).name
    }
    // Only camel-case name if it contains separators by which scule would split,
    // see STR_SPLITTERS: https://github.com/unjs/scule/blob/main/src/index.ts
    const as = /[-_.]/.test(name) ? camelCase(name) : name
    imports.push({ name: 'default', as, from: filepath })
  }

  for (const exp of exports) {
    if (exp.type === 'named') {
      for (const name of exp.names) {
        imports.push({ name, as: name, from: filepath })
      }
    } else if (exp.type === 'declaration') {
      if (exp.name) {
        imports.push({ name: exp.name, as: exp.name, from: filepath })
      }
    } else if (exp.type === 'star' && exp.specifier) {
      if (exp.name) {
        // export * as foo from './foo'
        imports.push({ name: exp.name, as: exp.name, from: filepath })
      } else {
        // export * from './foo', scan deeper
        const subfile = exp.specifier
        let subfilepath = resolve(dirname(filepath), subfile)

        if (!extname(subfilepath)) {
          for (const ext of FileExtensionLookup) {
            if (existsSync(`${subfilepath}${ext}`)) {
              subfilepath = `${subfilepath}${ext}`
              break
            } else if (existsSync(`${subfilepath}/index${ext}`)) {
              subfilepath = `${subfilepath}/index${ext}`
              break
            }
          }
        }

        if (!existsSync(subfilepath)) {
          // eslint-disable-next-line no-console
          console.warn(`[unimport] failed to resolve "${subfilepath}", skip scanning`)
          continue
        }

        imports.push(...await scanExports(subfilepath, seen))
      }
    }
  }

  return imports
}
```

在`scanExports`中，内部定义了一个`new Set()`，用于缓存并防止重复出现的文件路径，
接下来开始使用`readFile`读取其文件内容并使用`mlly`这个库中的`findExports`方法分析其静态导出关系。

在example中能得到的数据是：

```
  {
      type: 'default',
      name: 'default',
      code: 'export default ',
      start: 252,
      end: 267,
      names: [ 'default' ]
  }
```

获得其导出关系后，如果其导出类型为`default`(`export default`)，
则会解析这个文件，如果它的名字为`index`则会使用它的上一级目录名作为名字，比如`layouts/index.ts`则会以`layouts`作为**变量**`name`，
然后将文件名统一转化为驼峰的形式后放入`imports`内，如属性`name`为`default`，属性`as`为`layout`。

::: tip imports内的数据结构
```typescript
type Imports = {
  // 导出的名称
  name: string
  // 别名，之后会用得到
  as: string
  // 对应路径
  from: string
}[]
```
:::

接下来开始循环其导出关系，每一个不同的`type`会进行相应的处理。

- type为`named`时，如`export { bar, baz }`，会逐个放入`imports`中，属性`name`为`bar、baz`，属性`as`为`bar、baz`。
- type为`declaration`时，如`export const foo`，属性`name`为`foo`，属性`as`为`foo`。
- type为`star`并且存在`specifier`：
  - 若为`export * as foo from 'bar'`时，属性`name`为`foo`，属性`as`为`foo`。
  - 若为`export * from 'bar'`时，则会根据导出语句的路径寻找该文件，接下来会查找该文件是否有无扩展名(因为有可能是路径，也有可能是没有扩展名的文件)，
    若不存在扩展名时，从定义好的静态扩展名内拼接其路径查找是否存在此文件，不存在会去判断文件是否可能为`index`(因为导入路径可以是`layout/index` => `layout`)，
    都不存在则会报一个警告，最后走一个递归调用放入`imports`中。

至此，`scanDirExports`内的所有操作就完成了，现在回到`callback`中。

### modifyDefaultExportsAlias()

```typescript
function modifyDefaultExportsAlias(imports: ImportExtended[], options: Options): Import[] {
  if (options.defaultExportByFilename) {
    imports.forEach((i) => {
      if (i.name === 'default')
        i.as = i.from.split('/').pop()?.split('.')?.shift() ?? i.as
    })
  }

  return imports as Import[]
}
```

这个函数的作用时是否需要将文件名而不是从`findExports`内得到的`name`作为`as`属性值。

比如新增一个`Index.tsx`，**导入**并**默认导出**`MainLayout.tsx`，当配置了`defaultExportByFilename`时，这里的`as`将使用`Index`，反之为`MainLayout`。

至此，扫描文件的操作就完成了，接下来将会输出配置文件。

## 输出配置文件

分析静态依赖会在此进行，待完成后再统一输出

### writeConfigFiles()

```typescript
let lastDTS: string | undefined
let lastESLint: string | undefined
async function writeConfigFiles() {
  const promises: any[] = []
  if (dts) {
    promises.push(
      generateDTS(dts).then((content) => {
        if (content !== lastDTS) {
          lastDTS = content
          return writeFile(dts, content)
        }
      }),
    )
  }
  if (eslintrc.enabled && eslintrc.filepath) {
    promises.push(
      generateESLint().then((content) => {
        content = `${content}\n`
        if (content.trim() !== lastESLint?.trim()) {
          lastESLint = content
          return writeFile(eslintrc.filepath!, content)
        }
      }),
    )
  }
  return Promise.all(promises)
}
```

这里会分别对`dts`和`eslint`的生成的文件内容进行新旧比对，起到一个优化作用，先来看一下`dts`的生成。

### generateDTS()

```typescript
async function generateDTS(file: string) {
  await importsPromise
  const dir = dirname(file)
  const originalContent = existsSync(file) ? await fs.readFile(file, 'utf-8') : ''
  const originalDTS = parseDTS(originalContent)
  const currentContent = await unimport.generateTypeDeclarations({
    resolvePath: (i) => {
      if (i.from.startsWith('.') || isAbsolute(i.from)) {
        const related = slash(relative(dir, i.from).replace(/\.ts(x)?$/, ''))
        return !related.startsWith('.')
                ? `./${related}`
                : related
      }
      return i.from
    },
  })
  const currentDTS = parseDTS(currentContent)!
  if (originalDTS) {
    Object.keys(currentDTS).forEach((key) => {
      originalDTS[key] = currentDTS[key]
    })
    const dtsList = Object.keys(originalDTS).sort().map(k => `  ${k}: ${originalDTS[k]}`)
    return currentContent.replace(dtsReg, () => `declare global {\n${dtsList.join('\n')}\n}`)
  }

  return currentContent
}
```

在函数开始执行时，先等待了`importsPromise`执行完毕后才继续，先来看这里面的实现。

### importsPromise()

```typescript
const importsPromise = flattenImports(options.imports)
  .then((imports) => {
    if (!imports.length && !resolvers.length && !dirs?.length)
      console.warn('[auto-import] plugin installed but no imports has defined, see https://github.com/antfu/unplugin-auto-import#configurations for configurations')

    options.ignore?.forEach((name) => {
      const i = imports.find(i => i.as === name)
      if (i)
        i.disabled = true
    })

    return unimport.getInternalContext().replaceImports(imports)
  })
```

在`importsPromise`内先调用了`flattenImports`，将`options.imports`作为参数传入，
在`vite-react/vite.config.ts`文件内可以看到传入了`react`、`react-router-dom`、`react-i18next`、`ahooks`，接下来是**扫描并分析静态依赖关系**，看一下`flattenImports`的实现。

### flattenImports()

```typescript
export async function flattenImports (map: Options['imports']): Promise<Import[]> {
  const promises = await Promise.all(toArray(map)
          .map(async (definition) => {
            if (typeof definition === 'string') {
              if (!presets[definition])
                throw new Error(`[auto-import] preset ${ definition } not found`)
              const preset = presets[definition]
              definition = typeof preset === 'function' ? preset() : preset
            }
            if ('from' in definition && 'imports' in definition) {
              return await resolvePreset(definition as InlinePreset)
            } else {
              const resolved: Import[] = []
              for (const mod of Object.keys(definition)) {
                for (const id of definition[mod]) {
                  const meta = {
                    from: mod
                  } as Import
                  if (Array.isArray(id)) {
                    meta.name = id[0]
                    meta.as = id[1]
                  } else {
                    meta.name = id
                    meta.as = id
                  }
                  resolved.push(meta)
                }
              }
              return resolved
            }
          }))

  return promises.flat()
}
```

首先将参数`map`统一转化为了`array`类型后进行`map`循环，接下来有三个`if`分支判断：
1. 当元素为字符串类型(也就是`['react']`)时，从定义的静态依赖映射内寻找，不存在则直接报错，若为`function`则获取其函数返回值。
2. 当元素为对象类型且存在属性`from`和`imports`时(也就是`{ from: 'react', imports: ['useState'] }`)调用`resolvePreset`，其实现稍后在看。
3. 若都不满足(也就是`{ react: ['useState'] }` 或 `{ react: [['useState', 'useMyState']] }`)时，取出它们的`key`并循环其`value`，
创建一个对象，默认属性`from`在这里的值为`react`，然后根据`value`内的类型转为不同的形式。

:::tip 这里数组和非数组的区别
当为数组时，最终的样子是：
```typescript
import { useState as useMyState } from 'react'
```
非数组则为：
```typescript
import { useState } from 'react'
```
:::

最后返回转化完静态依赖后的数据，在`then`中，将转化完成的数据根据`options.ignore`属性配置的内容对对应的依赖名称过滤，
这里的过滤只是加了一个`disabled`属性，然后返回`replaceImports`的执行结果。

```typescript
async function replaceImports (imports: UnimportOptions['imports']) {
  ctx.staticImports = [ ...(imports || []) ].filter(Boolean)
  ctx.invalidate()
  await resolvePromise
  return updateImports()
}
```

将分析完毕的依赖浅拷贝一份并过滤掉不符合规则的数据后，等待`resolvePromise`执行完毕，最后返回`updateImports`的结果。

这里的`resolvePromise`是没有意义的，因为内部代码会对`presets`属性做一些操作，在`createContext`时`presets`为空，所以不会有任何操作。

`updateImports`的作用是更新动态依赖与静态依赖的数据，这里只需知道其作用。

现在回到`generateDTS`内，首先会去查找`dts`给的路径下的文件是否存在，若存在则直接读取文件内容并解析。

### parseDTS()

```typescript
const multilineCommentsRE = /\/\*.*?\*\//gms
const singlelineCommentsRE = /\/\/.*$/gm
const dtsReg = /declare\s+global\s*{(.*?)}/s
function parseDTS(dts: string) {
  dts = dts
          .replace(multilineCommentsRE, '')
          .replace(singlelineCommentsRE, '')
  const code = dts.match(dtsReg)?.[0]
  if (!code)
    return
  return Object.fromEntries(Array.from(code.matchAll(/['"]?(const\s*[^\s'"]+)['"]?\s*:\s*(.+?)[,;\r\n]/g)).map(i => [i[1], i[2]]))
}
```

在`parseDTS`函数前，声明了三个正则表达式，前两个的作用删除文件内的单行和多行注释，防止出现其它情况，第三个用于匹配声明文件内的`declare global { * }`字符，
当匹配成功时，使用另一个正则表达式来拆解成`key/value`形式后返回

::: tip
当文件内容为：
```typescript
declare global {
  const createRef: typeof import('react')['createRef']
}
```
根据定义的正则表达式并用`map`可以拆解为`['const createRef','typeof import('react')['createRef']']`

然后用`Object.fromEntries`方法转化为`{ 'const createRef': 'typeof import('react')['createRef']' }`
:::

接下来使用了`unimport`内的`generateTypeDeclarations`方法

### generateTypeDeclarations

```typescript
async function generateTypeDeclarations (options?: TypeDeclarationOptions) {
  const opts: TypeDeclarationOptions = {
    resolvePath: i => i.from,
    ...options
  }
  const {
    typeReExports = true
  } = opts
  // 获取储存的依赖数据
  const imports = await ctx.getImports()
  let dts = toTypeDeclarationFile(imports.filter(i => !i.type), opts)
  const typeOnly = imports.filter(i => i.type)
  if (typeReExports && typeOnly.length) {
    dts += '\n' + toTypeReExports(typeOnly, opts)
  }
  for (const addon of ctx.addons) {
    dts = await addon.declaration?.call(ctx, dts, opts) ?? dts
  }
  return dts
}
```

在这里会分别进行依赖的类型生成(`import {} from '')`和导出类型的生成(`export type {} from '')`，最后导出生成的结果。

回到`generateDTS`内，内部保存了每次生成的新旧值，新生成的类型会替换旧生成的类型数据，最后返回生成的数据并根据新旧内容决定是否输出文件。

至此就完成了`dts`文件的输出过程
