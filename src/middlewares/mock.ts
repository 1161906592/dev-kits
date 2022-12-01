import { Middleware } from 'koa'
import LRU from 'lru-cache'
import { mock } from 'mockjs'
import colors from 'picocolors'
import { mockParser, scriptParser } from '../common/mockPaser'
import { loadMockCode } from '../common/repository'
import { findSwager } from '../common/swagger'
import { runScriptInSandbox, sleep } from '../common/utils'

const lruCache = new LRU({
  max: 200,
  ttl: 1000 * 60 * 10,
  updateAgeOnGet: true,
})

export function getCacheByPath(path: string) {
  let cache = lruCache.get(path)

  if (!cache) {
    cache = {}
    lruCache.set(path, cache)
  }

  return cache
}

export default function mockMiddleware(): Middleware {
  return async (ctx, next) => {
    if (ctx.path.startsWith('/__swagger__')) return await next()

    const { swagger, path } = (await findSwager({ fullPath: ctx.path, method: ctx.method })) || {}
    if (!swagger || !path) return await next()

    console.log(`${colors.bold('Mock')}:  ${colors.green(ctx.path)}`)
    await sleep(Number(ctx.headers['x-mock-timeout']) || 0)

    try {
      const method = ctx.method.toLocaleLowerCase()
      const mockType = ctx.headers['x-mock-type']

      if (mockType === 'json') {
        const mockJSON = await loadMockCode(ctx.path, method, 'json')
        ctx.body = mockJSON || (await mock(await mockParser(swagger, path, method)))
      } else if (mockType === 'script') {
        const content = await loadMockCode(ctx.path, method, 'script')
        const { code = '' } = content ? JSON.parse(content) : {}

        ctx.body = await runScriptInSandbox(code || (await scriptParser(swagger, path, method)))({
          Mockjs: require('mockjs'),
          dayjs: require('dayjs'),
          cache: getCacheByPath(ctx.path),
        })
      } else {
        const mockCode = await loadMockCode(ctx.path, method, 'mock')
        ctx.body = mock(mockCode ? JSON.parse(mockCode) : await mockParser(swagger, path, method))
      }

      ctx.type = 'json'
    } catch (e) {
      console.error(e)
      ctx.status === 500
    }
  }
}
