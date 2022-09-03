import { Middleware } from 'koa'
import { mock } from 'mockjs'
import colors from 'picocolors'
import { ApiController } from '../controllers/ApiController'
import { createMockParser, createScriptParser } from '../utils/mockPaser'
import { runScriptInSandbox, loadMockCode, sleep } from '../utils/utils'

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

    try {
      const method = ctx.method.toLocaleLowerCase()
      const mockCode = await loadMockCode(path, method, 'mock')
      const mockType = ctx.headers['x-mock-type']

      if (mockType === 'json') {
        const mockJSON = mockCode ? mock(mockCode) : await loadMockCode(path, method, 'json')
        ctx.body = mockJSON || mock(createMockParser(swagger)(path, method))
      } else if (mockType === 'script') {
        const scriptCode = await loadMockCode(path, method, 'script')
        const dataMocker = await runScriptInSandbox(scriptCode || createScriptParser(swagger)(path, method))
        ctx.body = await dataMocker({ Mockjs: require('mockjs'), dayjs: require('dayjs') })
      } else {
        ctx.body = mock(mockCode ? JSON.parse(mockCode) : createMockParser(swagger)(path, method))
      }

      ctx.type = 'json'
    } catch (e) {
      console.log()
      console.error(e)
      ctx.status === 500
    }
  }
}
