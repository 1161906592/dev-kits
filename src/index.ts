import { Swagger } from './types'

export interface Codegen {
  name: string
  transform(input: string): {
    template: string
    data?: Record<string, unknown>
  }
}

export interface IConfig {
  codegen?: Record<string, Codegen>
  patchPath?(path: string, data: Swagger): string
  filePath?(path: string): string
  apiTemplate: string
}

export function defineConfig(config: IConfig) {
  return config
}

export { parseInterface } from './utils/utils'

export type { ParseResult } from './types'
