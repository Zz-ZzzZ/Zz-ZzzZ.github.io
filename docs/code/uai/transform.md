# transform

在分析完动态和静态依赖导出关系后，就需要将其依赖关系放入每个需要使用到的文件中，这一步将在`transform`中实现。

## transform()

```typescript
async function transform(code: string, id: string) {
  await importsPromise

  const s = new MagicString(code)

  await unimport.injectImports(s, id)

  if (!s.hasChanged())
    return

  writeConfigFilesThrottled()

  return {
    code: s.toString(),
    map: s.generateMap({ source: id, includeContent: true, hires: true }),
  }
}
```

首先会执行一次依赖分析，随后使用`MagicString`这个库来对代码字符串做一些操作，这里主要还是依靠`unimport`里的方法来转化。

## injectImports()

```typescript
async function injectImports (
  code: string | MagicString,
  id: string | undefined,
  ctx: UnimportContext,
  options?: InjectImportsOptions
): Promise<ImportInjectionResult> {
  const s = getMagicString(code)

  if (ctx.options.commentsDisable?.some(c => s.original.includes(c))) {
    return {
      s,
      get code () { return s.toString() },
      imports: []
    }
  }

  for (const addon of ctx.addons) {
    await addon.transform?.call(ctx, s, id)
  }

  const { isCJSContext, matchedImports, firstOccurrence } = await detectImports(s, ctx, options)
  const imports = await resolveImports(ctx, matchedImports, id)

  if (ctx.options.commentsDebug?.some(c => s.original.includes(c))) {
    // eslint-disable-next-line no-console
    const log = ctx.options.debugLog || console.log
    log(`[unimport] ${imports.length} imports detected in "${id}"${imports.length ? ': ' + imports.map(i => i.name).join(', ') : ''}`)
  }

  return {
    ...addImportToCode(s, imports, isCJSContext, options?.mergeExisting, options?.injectAtEnd, firstOccurrence),
    imports
  }
}
```

使用`getMagicString`包裹代码串，若定义了`commentsDisable`属性时会对代码串进行检查，这个属性用于在代码内以注释形式标记来跳过分析。

`unplugin-auto-import`内未传递名为`transform`的自定义插件，这里跳过，接下来是分析代码串内的依赖使用关系。

## detectImports()

```typescript
async function detectImports (code: string | MagicString, ctx: UnimportContext, options?: InjectImportsOptions) {
  const s = getMagicString(code)
  // Strip comments so we don't match on them
  const original = s.original
  const strippedCode = stripCommentsAndStrings(original)
  const syntax = detectSyntax(strippedCode)
  const isCJSContext = syntax.hasCJS && !syntax.hasESM
  let matchedImports: Import[] = []

  const occurrenceMap = new Map<string, number>()

  const map = await ctx.getImportMap()
  // Auto import, search for unreferenced usages
  if (options?.autoImport !== false) {
    // Find all possible injection
    Array.from(strippedCode.matchAll(matchRE))
      .forEach((i) => {
        // Remove dot access, but keep destructuring
        if (i[1] === '.') {
          return null
        }
        // Remove property, but keep `case x:` and `? x :`
        const end = strippedCode[i.index! + i[0].length]
        if (end === ':' && !['?', 'case'].includes(i[1].trim())) {
          return null
        }
        const name = i[2]
        const occurrence = i.index! + i[1].length
        if (occurrenceMap.get(name) || Infinity > occurrence) {
          occurrenceMap.set(name, occurrence)
        }
      })

    // Remove those already defined
    for (const regex of excludeRE) {
      for (const match of strippedCode.matchAll(regex)) {
        const segments = [...match[1]?.split(separatorRE) || [], ...match[2]?.split(separatorRE) || []]
        for (const segment of segments) {
          const identifier = segment.replace(importAsRE, '').trim()
          occurrenceMap.delete(identifier)
        }
      }
    }

    const identifiers = new Set(occurrenceMap.keys())
    matchedImports = Array.from(identifiers)
      .map((name) => {
        const item = map.get(name)
        if (item && !item.disabled) {
          return item
        }
        occurrenceMap.delete(name)
        return null
      })
      .filter(Boolean) as Import[]

    for (const addon of ctx.addons) {
      matchedImports = await addon.matchImports?.call(ctx, identifiers, matchedImports) || matchedImports
    }
  }

  // Transform virtual imports like `import { foo } from '#imports'`
  if (options?.transformVirtualImports !== false && options?.transformVirtualImoports !== false && ctx.options.virtualImports?.length) {
    const virtualImports = parseVirtualImports(original, ctx)
    virtualImports.forEach((i) => {
      s.remove(i.start, i.end)
      Object.entries(i.namedImports || {})
        .forEach(([name, as]) => {
          const original = map.get(name)
          if (!original) {
            throw new Error(`[unimport] failed to find "${name}" imported from "${i.specifier}"`)
          }
          matchedImports.push({
            from: original.from,
            name: original.name,
            as
          })
        })
    })
  }

  const firstOccurrence = Math.min(...Array.from(occurrenceMap.entries()).map(i => i[1]))

  return {
    s,
    strippedCode,
    isCJSContext,
    matchedImports,
    firstOccurrence
  }
}
```

使用`stripCommentsAndStrings`对代码串进行删除注释、引号内的内容等操作（使用了`strip-literal`这个库，目的应该是为了不会干扰对文件内使用到的依赖进行分析）。

```typescript
import React from 'react'
// 将会变为
import React from ''
```

使用`mlly`内的`detectSyntax`方法可获得代码串的模块类型。

接下来将`strippedCode`使用`matchRE`内定义的正则进行全局匹配并记录所有匹配到的代码的位置。

随后将定义好的的`excludeRE`内的正则根据这些匹配规则对`occurrenceMap`内储存的项进行移除，这些不需要加入依赖分析。

```typescript
const excludeRE = [
  // imported/exported from other module
  /\b(import|export)\b([\s\w_$*{},]+)\sfrom\b/gs,
  // defined as function
  /\bfunction\s*([\w_$]+?)\s*\(/gs,
  // defined as class
  /\bclass\s*([\w_$]+?)\s*{/gs,
  // defined as local variable
  /\b(?:const|let|var)\s+?(\[.*?\]|\{.*?\}|.+?)\s*?[=;\n]/gs
];
```

`occurrenceMap`中的`value`储存的是依赖插入的下标位置，这里获取了最靠前的下标位置后储存至`firstOccurrence`中，用于依赖插入位置的起点，`transformVirtualImports`和`addons`在这个库里没有定义就不看了。

至此已经完成了对代码串内的依赖分析，接下来将依赖写入代码中。

## addImportToCode()

```typescript
export function addImportToCode (
  code: string | MagicString,
  imports: Import[],
  isCJS = false,
  mergeExisting = false,
  injectAtLast = false,
  firstOccurrence = Infinity
): MagicStringResult {
  let newImports: Import[] = []
  const s = getMagicString(code)

  let _staticImports: StaticImport[] | undefined
  function findStaticImportsLazy () {
    if (!_staticImports) {
      _staticImports = findStaticImports(s.original).map(i => parseStaticImport(i))
    }
    return _staticImports
  }

  if (mergeExisting && !isCJS) {
    const existingImports = findStaticImportsLazy()
    const map = new Map<StaticImport, Import[]>()

    imports.forEach((i) => {
      const target = existingImports.find(e => e.specifier === i.from && e.imports.startsWith('{'))
      if (!target) {
        return newImports.push(i)
      }
      if (!map.has(target)) {
        map.set(target, [])
      }
      map.get(target)!.push(i)
    })

    for (const [target, items] of map.entries()) {
      const strings = items.map(i => stringifyImportAlias(i) + ', ')
      const importLength = target.code.match(/^\s*import\s*{/)?.[0]?.length
      if (importLength) {
        s.appendLeft(target.start + importLength, ' ' + strings.join('').trim())
      }
    }
  } else {
    newImports = imports
  }

  const newEntries = toImports(newImports, isCJS)
  if (newEntries) {
    const insertionIndex = injectAtLast
      ? findStaticImportsLazy().reverse().find(i => i.end <= firstOccurrence)?.end ?? 0
      : 0

    if (insertionIndex === 0) {
      s.prepend(newEntries + '\n')
    } else {
      s.appendRight(insertionIndex, '\n' + newEntries + '\n')
    }
  }

  return {
    s,
    get code () { return s.toString() }
  }
}
```

这里并未设置`mergeExisting`属性，因此跳过这一部分`if`代码块，直接进入`toImports`内。

```typescript
export function toImports (imports: Import[], isCJS = false) {
  const map = toImportModuleMap(imports)
  return Object.entries(map)
    .flatMap(([name, importSet]) => {
      const entries = []
      const imports = Array.from(importSet)
        .filter((i) => {
          // handle special imports
          // 为import 'react'时
          if (!i.name || i.as === '') {
            entries.push(
              isCJS
                ? `require('${name}');`
                : `import '${name}';`
            )
            return false
            // 为import React from 'react'时
          } else if (i.name === 'default') {
            entries.push(
              isCJS
                ? `const { default: ${i.as} } = require('${name}');`
                : `import ${i.as} from '${name}';`
            )
            return false
            // 为import * as React from 'react'时
          } else if (i.name === '*') {
            entries.push(
              isCJS
                ? `const ${i.as} = require('${name}');`
                : `import * as ${i.as} from '${name}';`
            )
            return false
          }

          return true
        })

      // 为import { useState } from 'react'时
      if (imports.length) {
        const importsAs = imports.map(i => stringifyImportAlias(i, isCJS))
        entries.push(
          isCJS
            ? `const { ${importsAs.join(', ')} } = require('${name}');`
            : `import { ${importsAs.join(', ')} } from '${name}';`
        )
      }

      return entries
    })
    .join('\n')
}
```

这里就是将使用到的依赖，根据模块类型一一转化为`require`/`import`。

回到`addImportToCode`内，将转化完毕后的结果，根据`injectAtLast`属性来决定插入到已存在于文件内的**静态导入**语句**之前**或**之后**。

最后，在`transform`内判断文件有无更改，若存在新的依赖也会更新之前分析的依赖导出关系。

`transform`这里有一些边界操作没有仔细探究，主要重点还是为了弄明白这些依赖是如何插入到代码中以及依赖使用的分析。
