import { Property } from '@liuyang0826/openapi-parser'
import * as HttpProxy from 'http-proxy'

export type MaybePromise<T> = T | Promise<T>

export interface Codegen {
  label: string
  key: string
  docs?: string
  children?: Codegen[]
  options?: {
    label: string
    value: string
  }[]
  transform?(
    input: string,
    options: string[]
  ): MaybePromise<{
    template: string
    data?: Record<string, unknown>
  }>
}

export interface Address {
  label: string
  value: string
  children?: Address[]
}

export interface ProxyOptions extends HttpProxy.ServerOptions {
  rewrite?: (path: string, address: string) => string
  configure?: (proxy: HttpProxy, options: ProxyOptions) => void
  isPass?: (path: string, address: string) => unknown
  websocket?: Record<string, string>
}

export interface MockOptions {
  listCount?: `${number}-${number}` | number
  template?(name: string, property: Property, deep: number): unknown
}

export interface Language {
  type: string
  extension: string
  template(): MaybePromise<string>
}

export interface IConfig {
  codegen?: Codegen[]
  patchPath?(path: string, address: string): string
  filePath?(path: string): string
  address?: Address[]
  proxy?: ProxyOptions
  mock?: MockOptions
  languages: Language[]
}

export function defineConfig(config: IConfig) {
  return config
}

export type { Property, HttpProxy }
