import { Swagger } from './types'

export interface Codegen {
  name: string
  options?: {
    label: string
    value: string
  }[]
  transform(
    input: string,
    options: string[]
  ): {
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
