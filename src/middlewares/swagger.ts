import axios from 'axios'
import { Middleware } from 'koa'
import { Swagger } from 'src/types'
import { config } from '../common/config'

export default function swaggerMiddleware(): Middleware {
  let swaggerJSON: Promise<{ swagger: Swagger; pathMap: Record<string, string | undefined> } | null> =
    Promise.resolve(null)

  const loadSwagger = (url?: string) => {
    if (url) {
      swaggerJSON = axios.get<Swagger>(url).then((res) => {
        const patchPath = config?.patchPath

        const pathMap: Record<string, string | undefined> = {}

        if (res.data) {
          Object.keys(res.data.paths).forEach((path) => {
            pathMap[(patchPath?.(path, res.data) || path).replace(/\/+/g, '/')] = path
          })
        }

        return {
          swagger: res.data,
          pathMap,
        }
      })
    }

    return swaggerJSON
  }

  return async (ctx, next) => {
    ctx.state.loadSwagger = async (url?: string) => {
      const res = await loadSwagger(url)
      url && ctx.state.setAddress(url)

      return res
    }

    await next()
  }
}
