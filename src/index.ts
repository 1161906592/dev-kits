import Server, { ServerOptions } from 'http-proxy'
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

interface Address {
  label: string
  value: string
  children?: Address[]
}

export interface ProxyOptions extends ServerOptions {
  rewrite?: (path: string, address: string) => string
  configure?: (proxy: Server, options: ProxyOptions) => void
  isPass?: (path: string, address: string) => unknown
}

export interface IConfig {
  apiTemplate: string
  codegen?: Record<string, Codegen>
  patchPath?(path: string, data: Swagger): string
  filePath?(path: string): string
  address?: Address[]
  proxy?: ProxyOptions
}

export function defineConfig(config: IConfig) {
  return config
}
