import { Property } from '@liuyang0826/openapi-parser'
import * as HttpProxy from 'http-proxy'
import type Router from '@koa/router'

export type MaybePromise<T> = T | Promise<T>

export interface Codegen {
  label: string
  key: string
  children?: Codegen[]
  render?(model: Record<string, unknown>, options: string[]): MaybePromise<string>
}

export interface Address {
  label: string
  value: string
  children?: Address[]
}

export interface ProxyOptions extends HttpProxy.ServerOptions {
  rewrite?: (path: string, address: string) => string
  configure?: (proxy: HttpProxy, options: ProxyOptions) => void
  isPass?: (path: string) => unknown
  websocket?: Record<string, string>
}

export interface MockOptions {
  listCount?: `${number}-${number}` | number
  template?(name: string, property: Property, deep: number): unknown
}

export interface Language {
  type: string
  extension: string
  render(data: any): MaybePromise<string>
}

export interface IConfig {
  codegen?: Codegen[] | ((id?: string) => MaybePromise<Codegen | Codegen[]>)
  patchPath?(path: string, address: string): string
  filePath?(path: string): string
  address?: Address[]
  proxy?: ProxyOptions
  mock?: MockOptions
  languages: Language[] | ((id?: string) => MaybePromise<Language | Language[]>)
  patchRouter?(KoaRouter: typeof Router): Router
}

export function defineConfig(config: IConfig) {
  return config
}

export type { Property, HttpProxy }
