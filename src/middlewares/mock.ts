import { Middleware } from 'koa'
import { mock } from 'mockjs'
import colors from 'picocolors'
import { createMockParser, createScriptParser } from '../common/mockPaser'
import { loadMockCode } from '../common/repository'
import { runScriptInSandbox, sleep } from '../common/utils'

export default function mockMiddleware(): Middleware {
  return async (ctx, next) => {
    if (ctx.path.startsWith('/__swagger__')) return await next()

    const { swagger, pathMap } = await ctx.state.loadSwagger()
    if (!swagger) return await next()

    const path = pathMap[ctx.path]
    if (!path) return await next()

    console.log(`${colors.bold('Mock')}:  ${colors.green(ctx.path)}`)
    await sleep(Number(ctx.headers['x-mock-timeout']) || 0)

    try {
      const method = ctx.method.toLocaleLowerCase()
      const mockCode = await loadMockCode(path, method, 'mock')
      const mockType = ctx.headers['x-mock-type']

      if (mockType === 'json') {
        const mockJSON = mockCode ? mock(mockCode) : await loadMockCode(path, method, 'json')
        ctx.body = mockJSON || mock(createMockParser(swagger)(path, method))
      } else if (mockType === 'script') {
        const { code } = JSON.parse(await loadMockCode(path, method, 'script'))

        ctx.body = await runScriptInSandbox(code || createScriptParser(swagger)(path, method))({
          Mockjs: require('mockjs'),
          dayjs: require('dayjs'),
        })
      } else {
        ctx.body = mock(mockCode ? JSON.parse(mockCode) : createMockParser(swagger)(path, method))
      }

      ctx.type = 'json'
    } catch (e) {
      console.error(e)
      ctx.status === 500
    }
  }
}
