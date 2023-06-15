import Router from '@koa/router'
import * as HttpProxy from 'http-proxy'

export type MaybePromise<T> = T | Promise<T>

export interface Codegen {
  label: string
  key: string
  children?: Codegen[]
  render?(model: Record<string, unknown>): MaybePromise<string>
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
  websocket?: Record<string, string | ({ rewrite?: (path: string) => string } & HttpProxy.ServerOptions)>
}

export interface MockOptions {
  listCount?: `${number}-${number}` | number
  template?(name: string, property: any, deep: number): unknown
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
  languages?: Language[] | ((id?: string) => MaybePromise<Language | Language[]>)
  patchRouter?(KoaRouter: typeof Router): Router
  // 最大缓存文档数量
  maxSize?: number
  root?: string
}

export function defineConfig(config: IConfig) {
  return config
}

export { startServer } from './app'

export type { HttpProxy }
