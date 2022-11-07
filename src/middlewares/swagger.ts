import { SwaggerV2, SwaggerV3 } from '@liuyang0826/openapi-parser'
import axios from 'axios'
import { Middleware } from 'koa'
import { getConfig } from '../common/config'

export default function swaggerMiddleware(): Middleware {
  const swaggerRecords: {
    address: string
    loader: Promise<SwaggerV2 | SwaggerV3 | null>
  }[] = []

  return async (ctx, next) => {
    ctx.state.loadSwagger = async (options: { address?: string; suffix?: string; path?: string; method?: string }) => {
      const { address, suffix, path = '', method = '' } = options

      if (address) {
        const loader = axios.get<SwaggerV2 | SwaggerV3>(address + suffix).then((res) => res.data)
        const index = swaggerRecords.findIndex((d) => d.address === address)

        if (index !== -1) {
          swaggerRecords.splice(index, 1)
        }

        swaggerRecords.unshift({ address, loader })

        return loader
      } else {
        for (let index = 0; index < swaggerRecords.length; index += 1) {
          const { loader, address } = swaggerRecords[index]
          const swagger = await loader

          if (swagger?.paths[getConfig()?.patchPath?.(path, address) || path]?.[method.toLowerCase()]) {
            return { address, swagger }
          }
        }
      }
    }

    await next()
  }
}
