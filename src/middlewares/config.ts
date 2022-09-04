import chokidar from 'chokidar'
import jiti from 'jiti'
import { Middleware } from 'koa'
import { IConfig } from '..'
import { defaultConfigFile } from '../constants'

export function configMiddleware(): Middleware {
  let config: IConfig | undefined

  const parseConfig = () => {
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

  const watcher = chokidar.watch(`${process.cwd()}/${defaultConfigFile}`)

  watcher.on('change', async () => {
    parseConfig()
  })

  return async (ctx, next) => {
    ctx.state.config = config

    await next()
  }
}
