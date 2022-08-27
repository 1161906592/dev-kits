import * as fs from 'fs-extra'
import { dataDir } from '../constants'
import { ParseResult, Swagger } from '../types'

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

export function parseInterface(input: string) {
  return (input
    .match(/.*?interface\s+(\w+)\s+{([\w\W]*)}/)?.[2]
    .split(/\r?\n/)
    .map((d) => {
      const matches = d.match(/(\w+)(\?)?:\s*(\w+)\s*(?:\/\/\s*(\S*)\s*(.+)?)?/)

      if (!matches) {
        return
      }

      return {
        key: matches[1],
        required: !matches[2],
        type: matches[3],
        title: matches[4]?.trim(),
        meta: matches[5]?.trim(),
      }
    })
    .filter((d) => d) || []) as ParseResult[]
}
