import { ParameterizedContext } from 'koa'
import { mock } from 'mockjs'
import { getConfig } from '../common/config'
import { mockParser, scriptParser } from '../common/mockPaser'
import { loadMockCode, removeMockCode, saveMockCode } from '../common/repository'
import { formatCode, transformCode } from '../common/utils'

class MockController {
  async mockCode(ctx: ParameterizedContext) {
    const method = ctx.query.method as string
    const type = ctx.query.type as string

    const { address, swagger } = (await ctx.state.loadSwagger(ctx.query)) || {}
    if (!swagger) throw ''

    const path = getConfig()?.patchPath?.(ctx.query.path as string, address) || (ctx.query.path as string)

    const mockCode = await loadMockCode(path, method, 'mock')
    const template = mockParser(swagger, path, method)
    let saved = false
    let code = ''

    if (type === 'json') {
      const jsonCode = await loadMockCode(path, method, 'json')
      saved = !!jsonCode
      code = jsonCode || JSON.stringify(mock(mockCode ? JSON.parse(mockCode) : template), null, 2)
    } else if (type === 'script') {
      const content = await loadMockCode(path, method, 'script')
      const { raw = '' } = content ? JSON.parse(content) : {}
      saved = !!raw
      code = formatCode(raw || scriptParser(swagger, path, method))
    } else {
      saved = !!mockCode
      code = mockCode || JSON.stringify(template, null, 2)
    }

    ctx.ok({ saved, code })
  }

  async updateMock(ctx: ParameterizedContext) {
    const {
      request: { body },
    } = ctx

    const { address, swagger } = (await ctx.state.loadSwagger(body)) || {}
    if (!swagger) throw ''
    const path = getConfig()?.patchPath?.(body.path, address) || body.path

    const cur = swagger.paths?.[path]?.[body.method]

    if (!cur) {
      throw ''
    }

    saveMockCode(
      path,
      body.method,
      body.type,
      body.type === 'script'
        ? JSON.stringify({ raw: body.config, code: await transformCode(body.config) })
        : body.config
    )

    ctx.ok()
  }

  async resetMock(ctx: ParameterizedContext) {
    const {
      request: { body },
    } = ctx

    const { address, swagger } = (await ctx.state.loadSwagger(body)) || {}
    if (!swagger) return

    const path = getConfig()?.patchPath?.(body.path, address) || body.path

    removeMockCode(path, body.method, body.type)

    ctx.ok()
  }
}

export default new MockController()
