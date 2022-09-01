import axios from 'axios'
import { render } from 'ejs'
import execa from 'execa'
import * as fs from 'fs-extra'
import { ParameterizedContext } from 'koa'
import { mock } from 'mockjs'
import colors from 'picocolors'
import { Swagger } from '../types'
import { createCodeParser } from '../utils/codePaser'
import { config } from '../utils/config'
import { createMockParser } from '../utils/mockPaser'
import { findCodegen, formatCode, loadMockCode, resetMockCode, saveMockCode } from '../utils/utils'

export class ApiController {
  static swaggerJSON: Promise<Swagger | null> = Promise.resolve(null)
  static pathMap: Record<string, string | undefined> = {}
  async swagger(ctx: ParameterizedContext) {
    const url = ctx.query.url as string

    console.log(`\n${colors.bold('Pull swagger')}:  ${colors.green(url)}`)

    try {
      const swaggerJSON = axios.get<Swagger>(url).then((res) => {
        const patchPath = config?.patchPath

        if (res.data) {
          const map: Record<string, string | undefined> = {}

          Object.keys(res.data.paths).forEach((path) => {
            map[(patchPath?.(path, res.data) || path).replace(/\/+/g, '/')] = path
          })

          ApiController.pathMap = map
        }

        return res.data
      })

      ApiController.swaggerJSON = swaggerJSON

      ctx.body = {
        status: true,
        data: await swaggerJSON,
      }
    } catch (e) {
      console.log()
      console.error(e)

      ctx.body = {
        status: false,
        message: '文档加载失败',
      }
    }
  }

  async apiCode(ctx: ParameterizedContext) {
    const path = ctx.query.path as string
    const method = ctx.query.method as string

    try {
      const swagger = await ApiController.swaggerJSON
      if (!swagger) throw ''

      const codeParser = createCodeParser(swagger, config)

      ctx.body = {
        status: true,
        data: codeParser(path, method),
      }
    } catch (e) {
      console.log()
      console.error(e)

      ctx.body = {
        status: false,
        message: '请先加载接口文档',
      }
    }
  }

  async mockCode(ctx: ParameterizedContext) {
    const path = ctx.query.path as string
    const method = ctx.query.method as string

    try {
      const swagger = await ApiController.swaggerJSON
      if (!swagger) throw ''

      const [mockCode, jsonCode] = await Promise.all([
        loadMockCode(path, method, 'mock'),
        loadMockCode(path, method, 'json'),
      ])

      const mockParser = createMockParser(swagger)
      const template = mockParser(path, method)
      console.log(JSON.stringify(template, null, 2))

      ctx.body = {
        status: true,
        data: {
          mockSaved: !!mockCode,
          mock: mockCode || JSON.stringify(template, null, 2),
          jsonSaved: !!jsonCode,
          json: jsonCode || JSON.stringify(mock(template), null, 2),
        },
      }
    } catch (e) {
      console.log()
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
      const swagger = await ApiController.swaggerJSON
      if (!swagger) throw ''

      const cur = swagger.paths?.[body.path]?.[body.method]

      if (!cur) {
        throw ''
      }

      saveMockCode(body.path, body.method, body.type, body.config)

      ctx.body = {
        status: true,
      }
    } catch (e) {
      console.log()
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

    resetMockCode(body.path, body.method, body.type)

    ctx.body = {
      status: true,
    }
  }

  async syncCode(ctx: ParameterizedContext) {
    const {
      request: { body },
    } = ctx

    try {
      const swagger = await ApiController.swaggerJSON
      if (!swagger) throw ''
      const codeParser = createCodeParser(swagger, config)

      const result = await Promise.all(
        (body as { path: string; method: string }[]).map(async (item) => {
          const curPath = swagger.paths[item.path as string]
          if (!curPath) return
          const { tsCode } = codeParser(item.path, item.method) || {}
          if (!tsCode) return

          const realPath = config?.patchPath ? config.patchPath(item.path, swagger) : `${swagger.basePath}/${item.path}`

          const filePath = `${process.cwd()}/src${`${(config?.filePath ? config.filePath(realPath) : realPath).replace(
            /\//g,
            '/'
          )}${Object.keys(curPath).length > 1 ? `-${(item.method as string).toLocaleLowerCase()}` : ''}.ts`}`

          // 检测是否禁止覆盖
          const isExists = await fs.pathExists(filePath)

          if (isExists) {
            const content = await fs.readFile(filePath, 'utf-8')

            if (/\/\*\s*swagger-no-overwrite\s*\*\//.test(content)) {
              return {
                status: 'disabled',
                filePath,
                ...item,
              }
            }
          } else {
            await fs.ensureFile(filePath)
          }

          await fs.writeFile(filePath, tsCode, 'utf-8')

          return {
            status: 'ok',
            filePath,
            ...item,
          }
        })
      )

      try {
        // 同步项目的eslint格式
        await Promise.all(
          result
            .filter((d) => d?.status === 'ok')
            .map((item) => {
              return execa('eslint', ['--fix', item?.filePath || ''], {
                stdio: 'inherit',
                cwd: process.cwd(),
              })
            })
        )
      } catch {
        //
      }

      const disabledResult = result.filter((d) => d?.status === 'disabled')

      ctx.body = {
        status: true,
        message: disabledResult.length
          ? `${disabledResult.map((d) => `${d?.method.toUpperCase()}: ${d?.path}`).join('、')}禁止被覆盖已跳过`
          : '同步成功',
      }
    } catch (e) {
      console.log()
      console.error(e)

      ctx.body = {
        status: false,
        message: '请先加载接口文档',
      }
    }
  }

  async config(ctx: ParameterizedContext) {
    const { codegen = [], address = [] } = config || {}

    ctx.body = {
      status: true,
      data: {
        codegen,
        address,
      },
    }
  }

  async codegen(ctx: ParameterizedContext) {
    try {
      const key = ctx.request.body.key
      const codegen = findCodegen(config?.codegen || [], key)

      const { template, data } = codegen?.transform?.(ctx.request.body.input, ctx.request.body.options) || {}

      ctx.body = {
        status: true,
        data: template ? formatCode(render(template, data)) : '',
      }
    } catch (e) {
      console.log()
      console.error(e)

      ctx.body = {
        status: false,
        mesaage: '生成失败',
      }
    }
  }
}

export default new ApiController()
