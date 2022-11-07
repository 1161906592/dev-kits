import { SwaggerV2, SwaggerV3 } from '@liuyang0826/openapi-parser'
import axios from 'axios'
import { Middleware } from 'koa'
import { getConfig } from '../common/config'

export default function swaggerMiddleware(): Middleware {
  const swaggerRecords: {
    address: string
    loader: Promise<{
      swagger: SwaggerV2 | SwaggerV3 | null
      pathMap: Record<string, Record<string, unknown> | undefined>
      varPaths: { regExp: RegExp; methods: Record<string, unknown> | undefined }[]
    }>
  }[] = []

  return async (ctx, next) => {
    ctx.state.loadSwagger = async (options: { address?: string; suffix?: string; path?: string; method?: string }) => {
      const { address, suffix, path = '', method = '' } = options
      const patchPath = getConfig()?.patchPath

      if (address) {
        const loader = axios.get<SwaggerV2 | SwaggerV3>(address + suffix).then((res) => {
          const pathMap: Record<string, Record<string, unknown> | undefined> = {}
          const varPaths: { regExp: RegExp; methods: Record<string, unknown> | undefined }[] = []

          Object.keys(res.data.paths).forEach((path) => {
            const fullPath = patchPath?.(path, address) || path

            if (/\{(.+?)\}/.test(path)) {
              varPaths.push({
                regExp: new RegExp(path.replace(/\{.+?\}/g, '[^/]+')),
                methods: res.data.paths[path],
              })
            } else {
              pathMap[fullPath] = res.data.paths[path]
            }
          })

          return { swagger: res.data, pathMap, varPaths }
        })

        const index = swaggerRecords.findIndex((d) => d.address === address)

        if (index !== -1) {
          swaggerRecords.splice(index, 1)
        }

        swaggerRecords.unshift({ address, loader })

        return (await loader).swagger
      } else {
        for (let index = 0; index < swaggerRecords.length; index += 1) {
          const { loader, address } = swaggerRecords[index]
          const { swagger, pathMap, varPaths } = await loader
          const lowerCaseMethod = method.toLowerCase()

          if (
            pathMap[path]?.[lowerCaseMethod] ||
            varPaths.find((d) => d.regExp.test(path))?.methods?.[lowerCaseMethod]
          ) {
            return { address, swagger }
          }
        }
      }
    }

    await next()
  }
}
