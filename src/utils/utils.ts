import promises from 'fs/promises'
import { format } from 'prettier'
import { Codegen } from '..'
import { dataDir } from '../constants'

// 匹配引用类型的名称
export function matchInterfaceName($ref?: string) {
  return $ref?.match(/#\/definitions\/(\w+).*/)?.[1] || ''
}

export function sleep(timeout: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, timeout)
  })
}

export function formatCode(code: string) {
  return format(code, {
    printWidth: 120,
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
    bracketSpacing: true,
    jsxSingleQuote: false,
    arrowParens: 'always',
    proseWrap: 'never',
    endOfLine: 'auto',
    insertPragma: false,
    useTabs: false,
    parser: 'typescript',
  }).replace(/\n\s*\n/g, '\n')
}

export async function saveMockCode(path: string, method: string, type: string, code: string) {
  if (!code) return
  const filename = `${path}-${method}-${type}`.slice(1).replace(/\//g, '+')
  await promises.writeFile(`${dataDir}/${filename}.txt`, code, 'utf8')
}

export async function resetMockCode(path: string, method: string, type: string) {
  const filename = `${path}-${method}-${type}`.slice(1).replace(/\//g, '+')

  try {
    await promises.unlink(`${dataDir}/${filename}.txt`)
  } catch {
    //
  }
}

export async function loadMockCode(path: string, method: string, type: string) {
  const filename = `${path}-${method}-${type}`.slice(1).replace(/\//g, '+')

  try {
    return await promises.readFile(`${dataDir}/${filename}.txt`, 'utf8')
  } catch {
    return ''
  }
}

export function findCodegen(codegen: Codegen[], key: string) {
  let target: Codegen | undefined = undefined

  const fn = (list: Codegen[]) => {
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index]

      if (item.key === key) {
        target = item

        return true
      }

      if (fn(item.children || [])) {
        return true
      }
    }
  }

  fn(codegen)

  return target as Codegen | undefined
}
