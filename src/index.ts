import Server, { ServerOptions } from 'http-proxy'
import { Property } from './types'

export interface Codegen {
  label: string
  key: string
  children?: Codegen[]
  options?: {
    label: string
    value: string
  }[]
  transform?(
    input: string,
    options: string[]
  ): {
    template: string
    data?: Record<string, unknown>
  }
}

export interface Address {
  label: string
  value: string
  children?: Address[]
}

export interface ProxyOptions extends ServerOptions {
  rewrite?: (path: string, address: string) => string
  configure?: (proxy: Server, options: ProxyOptions) => void
  isPass?: (path: string, address: string) => unknown
  websocket?: Record<string, string>
}

export interface MockOpions {
  listCount?: `${number}-${number}` | number
  template?(name: string, property: Property, deep: number): unknown
}

export interface IConfig {
  apiTemplate: string
  codegen?: Codegen[]
  patchPath?(path: string, address: string): string
  filePath?(path: string): string
  address?: Address[]
  proxy?: ProxyOptions
  mock?: MockOpions
}

export function defineConfig(config: IConfig) {
  return config
}
