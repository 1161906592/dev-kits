import { Middleware } from 'koa'
import { mock } from 'mockjs'
import colors from 'picocolors'
import { mockParser, scriptParser } from '../common/mockPaser'
import { loadMockCode } from '../common/repository'
import { runScriptInSandbox, sleep } from '../common/utils'

export default function mockMiddleware(): Middleware {
  return async (ctx, next) => {
    if (ctx.path.startsWith('/__swagger__')) return await next()

    const { swagger } = (await ctx.state.loadSwagger(ctx)) || {}
    if (!swagger) return await next()

    const path = ctx.path
    console.log(`${colors.bold('Mock')}:  ${colors.green(ctx.path)}`)
    await sleep(Number(ctx.headers['x-mock-timeout']) || 0)

    try {
      const method = ctx.method.toLocaleLowerCase()
      const mockType = ctx.headers['x-mock-type']

      if (mockType === 'json') {
        const mockCode = await loadMockCode(path, method, 'mock')
        const mockJSON = mockCode ? mock(mockCode) : await loadMockCode(path, method, 'json')
        ctx.body = mockJSON || mock(mockParser(swagger, path, method))
      } else if (mockType === 'script') {
        const content = await loadMockCode(path, method, 'script')
        const { code = '' } = content ? JSON.parse(content) : {}

        ctx.body = await runScriptInSandbox(code || scriptParser(swagger, path, method))({
          Mockjs: require('mockjs'),
          dayjs: require('dayjs'),
        })
      } else {
        const mockCode = await loadMockCode(path, method, 'mock')
        ctx.body = mock(mockCode ? JSON.parse(mockCode) : mockParser(swagger, path, method))
      }

      ctx.type = 'json'
    } catch (e) {
      console.error(e)
      ctx.status === 500
    }
  }
}
