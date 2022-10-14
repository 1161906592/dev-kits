import { loadConfig } from 'unconfig'
import { Codegen, IConfig } from '..'
import { configFile, extensions } from '../constants'
import { findCodegen } from './utils'

export let config: IConfig | undefined

export function getConfig() {
  return config
}

export async function parseConfig() {
  const result = await loadConfig<IConfig>({
    sources: [
      {
        files: configFile,
        extensions: extensions,
      },
    ],
    merge: false,
  })

  config = result.config
}

export async function resolveCodegen(): Promise<Codegen[]>

export async function resolveCodegen(id: string): Promise<Codegen>

export async function resolveCodegen(id?: string) {
  if (typeof config?.codegen === 'function') {
    return await config.codegen(id)
  }

  if (id !== undefined) {
    return findCodegen(config?.codegen || [], id)
  }

  return config?.codegen || []
}

export async function resolveLanguages() {
  return (typeof config?.languages === 'function' ? await config.languages() : config?.languages) || []
}
