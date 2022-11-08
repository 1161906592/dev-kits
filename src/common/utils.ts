import { format } from 'prettier'
import { NodeVM } from 'vm2'
import { Codegen } from '..'

export function sleep(timeout: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, timeout)
  })
}

export function formatCode(code: string) {
  try {
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
  } catch (e) {
    console.error(e)

    return code
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

const vm = new NodeVM({
  console: 'inherit',
})

export async function transformCode(code: string) {
  const result = await require('esbuild').transform(code, {
    target: ['node14.18', 'node16'],
    platform: 'node',
    format: 'cjs',
    sourcemap: false,
  })

  return result.code as string
}

// 沙箱执行脚本
export function runScriptInSandbox(code: string) {
  return vm.run(code).default
}
