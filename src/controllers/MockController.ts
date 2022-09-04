import { ParameterizedContext } from 'koa'
import { mock } from 'mockjs'
import { createMockParser, createScriptParser } from '../common/mockPaser'
import { loadMockCode, removeMockCode, saveMockCode } from '../common/repository'
import { formatCode, transformCode } from '../common/utils'

class MockController {
  async mockCode(ctx: ParameterizedContext) {
    const path = ctx.query.path as string
    const method = ctx.query.method as string
    const type = ctx.query.type as string

    try {
      const swagger = (await ctx.state.loadSwagger()).swagger
      if (!swagger) throw ''

      const mockCode = await loadMockCode(path, method, 'mock')
      const template = createMockParser(swagger)(path, method)
      let saved = false
      let code = ''

      if (type === 'json') {
        const jsonCode = await loadMockCode(path, method, 'json')
        saved = !!jsonCode
        code = jsonCode || JSON.stringify(mock(mockCode ? JSON.parse(mockCode) : template), null, 2)
      } else if (type === 'script') {
        const { raw } = JSON.parse(await loadMockCode(path, method, 'script'))
        saved = !!raw
        code = formatCode(raw || createScriptParser(swagger)(path, method))
      } else {
        saved = !!mockCode
        code = mockCode || JSON.stringify(template, null, 2)
      }

      ctx.body = {
        status: true,
        data: { saved, code },
      }
    } catch (e) {
      console.error(e)

      ctx.body = {
        status: false,
        message: '请先加载接口文档',
      }
    }
  }

  async updateMock(ctx: ParameterizedContext) {
    const {
      request: { body },
    } = ctx

    try {
      const swagger = (await ctx.state.loadSwagger()).swagger
      if (!swagger) throw ''

      const cur = swagger.paths?.[body.path]?.[body.method]

      if (!cur) {
        throw ''
      }

      saveMockCode(
        body.path,
        body.method,
        body.type,
        body.type === 'script'
          ? JSON.stringify({ raw: body.config, code: await transformCode(body.config) })
          : body.config
      )

      ctx.body = {
        status: true,
      }
    } catch (e) {
      console.error(e)

      ctx.body = {
        status: false,
        message: '请先加载接口文档',
      }
    }
  }

  async resetMock(ctx: ParameterizedContext) {
    const {
      request: { body },
    } = ctx

    removeMockCode(body.path, body.method, body.type)

    ctx.body = {
      status: true,
    }
  }
}

export default new MockController()
