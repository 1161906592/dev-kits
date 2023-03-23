import Router from '@koa/router'
import { loadConfig } from 'unconfig'
import { Codegen, IConfig, Language } from '..'
import { configFile, extensions } from '../constants'
import { findCodegen } from './utils'

let config: Promise<IConfig> | undefined
let router: Promise<Router | undefined> | undefined

export function getConfig(): Promise<IConfig> {
  return config ?? Promise.resolve({})
}

export function getRouter() {
  return (
    router ||
    (router = config?.then(({ patchRouter }) => {
      return patchRouter?.(Router)
    }))
  )
}

export async function parseConfig() {
  router = undefined

  config = loadConfig<IConfig>({
    sources: [
      {
        files: configFile,
        extensions: extensions,
      },
    ],
    merge: false,
  }).then((result) => {
    return result.config
  })
}

export async function resolveCodegen(): Promise<Codegen[]>

export async function resolveCodegen(id: string): Promise<Codegen>

export async function resolveCodegen(id?: string) {
  const codegen = (await config)?.codegen

  if (typeof codegen === 'function') {
    return await codegen(id)
  }

  if (id !== undefined) {
    return findCodegen(codegen || [], id)
  }

  return codegen || []
}

export async function resolveLanguages(): Promise<Language[]>

export async function resolveLanguages(type: string): Promise<Language>

export async function resolveLanguages(type?: string) {
  const languages = (await config)?.languages

  if (typeof languages === 'function') {
    return await languages(type)
  }

  if (type !== undefined) {
    return (languages || []).find((d) => d.type === type)
  }

  return languages || []
}
