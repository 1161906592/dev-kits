import * as fs from 'fs-extra'
import { format } from 'prettier'
import { dataDir } from '../constants'
import { Swagger } from '../types'

// 匹配引用类型的名称
export function matchInterfaceName($ref?: string) {
  return $ref?.match(/#\/definitions\/(\w+).*/)?.[1] || ''
}

export function sleep(timeout: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, timeout)
  })
}

export async function loadSwaggerJSON() {
  return JSON.parse(await fs.readFile(`${dataDir}/api.json`, 'utf-8')) as Swagger
}

export async function saveSwaggerJSON(swaggerJSON: string) {
  await fs.ensureFile(`${dataDir}/api.json`)
  await fs.writeFile(`${dataDir}/api.json`, swaggerJSON, 'utf-8')
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
