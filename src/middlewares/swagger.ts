import { SwaggerV2, SwaggerV3 } from '@liuyang0826/openapi-parser'
import axios from 'axios'
import { Middleware } from 'koa'
import { getConfig } from '../common/config'

export default function swaggerMiddleware(): Middleware {
  let swaggerData: Promise<{ swagger: SwaggerV2 | SwaggerV3; pathMap: Record<string, string | undefined> } | null> =
    Promise.resolve(null)

  const loadSwagger = (url?: string) => {
    if (url) {
      swaggerData = axios.get<SwaggerV2 | SwaggerV3>(url).then((res) => {
        const patchPath = getConfig()?.patchPath

        const pathMap: Record<string, string | undefined> = {}

        if (res.data) {
          Object.keys(res.data.paths).forEach((path) => {
            pathMap[(patchPath?.(path, url) || path).replace(/\/+/g, '/')] = path
          })
        }

        return {
          swagger: res.data,
          pathMap,
        }
      })
    }

    return swaggerData
  }

  return async (ctx, next) => {
    ctx.state.loadSwagger = async (address?: string, suffix?: string) => {
      const res = await loadSwagger(address ? address + suffix : undefined)
      address && ctx.state.setAddress(address)

      return res
    }

    await next()
  }
}
