import { loadConfig } from 'unconfig'
import { IConfig } from '..'
import { configFile, extensions } from '../constants'

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

export async function resolveCodegen() {
  return (typeof config?.codegen === 'function' ? await config.codegen() : config?.codegen) || []
}

export async function resolveLanguages() {
  return (typeof config?.languages === 'function' ? await config.languages() : config?.languages) || []
}
