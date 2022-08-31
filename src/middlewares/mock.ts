import { Middleware } from 'koa'
import { mock } from 'mockjs'
import colors from 'picocolors'
import { ApiController } from '../controllers/ApiController'
import { createMockParser } from '../utils/mockPaser'
import { loadMockCode, sleep } from '../utils/utils'

export default function mockMiddleware(): Middleware {
  return async (ctx, next) => {
    if (ctx.path.startsWith('/__swagger__')) return await next()

    const swagger = await ApiController.swaggerJSON
    if (!swagger) return await next()
    const pathMap = ApiController.pathMap

    const path = pathMap[ctx.path]
    if (!path) return await next()

    console.log(`\n${colors.bold('Mock')}:  ${colors.green(ctx.path)}`)
    await sleep(Number(ctx.headers['x-mock-timeout']) || 0)

    const method = ctx.method.toLocaleLowerCase()
    ctx.type = 'json'

    if (ctx.headers['x-mock-type'] === 'mock') {
      const mockCode = await loadMockCode(path, method, 'mock')
      ctx.body = mock(mockCode ? JSON.parse(mockCode) : createMockParser(swagger)(path, method))
    } else {
      const mockJSON = await loadMockCode(path, method, 'json')
      ctx.body = mockJSON || mock(createMockParser(swagger)(path, method))
    }
  }
}
