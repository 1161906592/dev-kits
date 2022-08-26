import { Middleware } from 'koa'
import { mock } from 'mockjs'
import { loadSwaggerJSON, sleep } from '../utils/utils'

export default function mockMiddleware(): Middleware {
  return async (ctx, next) => {
    if (ctx.headers['x-use-mock'] !== '1' || !ctx.headers['x-mock-type']) {
      return await next()
    }

    try {
      const swaggerJSON = await loadSwaggerJSON()

      const realPath =
        swaggerJSON.basePath === '/' ? ctx.path : ctx.path.substring(`/api${swaggerJSON.basePath}`.length)

      if (ctx.headers['x-mock-type'] === 'mock') {
        const mockTemplate = swaggerJSON.paths[realPath][ctx.method.toLocaleLowerCase()].mockTemplate

        if (mockTemplate) {
          await sleep(Number(ctx.headers['x-mock-timeout']) || 0)
          ctx.body = mock(JSON.parse(mockTemplate))

          return
        }
      }

      if (ctx.headers['x-mock-type'] === 'json') {
        const mockJSON = swaggerJSON.paths[realPath][ctx.method.toLocaleLowerCase()].mockJSON

        if (mockJSON) {
          await sleep(Number(ctx.headers['x-mock-timeout']) || 0)
          ctx.body = mockJSON

          return
        }
      }
    } catch {
      ctx.body = '请先加载接口文档'
    }

    await next()
  }
}
