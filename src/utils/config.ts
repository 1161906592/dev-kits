import jiti from 'jiti'
import { IConfig } from '..'
import { defaultConfigFile } from '../constants'

export let config: IConfig | undefined

export function parseConfig() {
  try {
    config = jiti(process.cwd(), {
      cache: false,
      requireCache: false,
      v8cache: false,
      interopDefault: true,
      esmResolve: true,
    })(`./${defaultConfigFile}`)
  } catch (err: any) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.error(`Error trying import ${defaultConfigFile} from ${process.cwd()}`, err)
    }
  }
}
