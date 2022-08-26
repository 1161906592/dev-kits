import * as fs from 'fs-extra'
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

const dataDir = `${process.cwd()}/.swagger`
fs.ensureFileSync(`${dataDir}/.gitignore`)
fs.writeFileSync(`${dataDir}/.gitignore`, '*', 'utf-8')

export async function loadSwaggerJSON() {
  return JSON.parse(await fs.readFile(`${dataDir}/api.json`, 'utf-8')) as Swagger
}

export async function saveSwaggerJSON(swaggerJSON: string) {
  await fs.ensureFile(`${dataDir}/api.json`)
  await fs.writeFile(`${dataDir}/api.json`, swaggerJSON, 'utf-8')
}
