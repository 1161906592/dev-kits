import axios from 'axios'
import { render } from 'ejs'
import execa from 'execa'
import * as fs from 'fs-extra'
import { ParameterizedContext } from 'koa'
import { mock } from 'mockjs'
import { Swagger } from '../types'
import { createCodeParser } from '../utils/codePaser'
import { config } from '../utils/config'
import { createMockParser } from '../utils/mockPaser'
import { formatCode, loadSwaggerJSON, saveSwaggerJSON } from '../utils/utils'

class ApiController {
  async getParseResult(ctx: ParameterizedContext) {
    const url = ctx.query.url as string
    const refresh = ctx.query.refresh as string

    if (refresh === '1') {
      const res = await axios.get<Swagger>(url)
      const data = res?.data

      if (data) {
        const codeParser = createCodeParser(data, await config)
        const mockParser = createMockParser(data)
        const paths = data.paths

        Object.keys(paths).forEach((path) => {
          Object.keys(paths[path]).forEach((method) => {
            const { tsCode, jsCode } = codeParser(path, method)
            paths[path][method].tsCode = tsCode
            paths[path][method].jsCode = jsCode

            paths[path][method].mockTemplate = JSON.stringify(mockParser(path, method), null, 2)

            paths[path][method].mockJSON = JSON.stringify(mock(mockParser(path, method)), null, 2)
          })
        })

        const swaggerJSON = JSON.stringify(data, null, 2)
        await saveSwaggerJSON(swaggerJSON)
        ctx.body = swaggerJSON
      }

      return
    }

    try {
      ctx.body = await loadSwaggerJSON()
    } catch {
      ctx.body = '请先加载接口文档'
    }
  }

  async updateMockConfig(ctx: ParameterizedContext) {
    const {
      request: { body },
    } = ctx

    try {
      const swaggerJSON = await loadSwaggerJSON()
      const cur = swaggerJSON.paths[body.url][body.method]

      if (body.type === 'mockJSON') {
        cur.mockJSON = body.config
      } else {
        cur.mockTemplate = body.config
      }

      await saveSwaggerJSON(JSON.stringify(swaggerJSON, null, 2))
      ctx.body = '修改成功'
    } catch {
      ctx.body = '请先加载接口文档'
    }
  }

  async syncCode(ctx: ParameterizedContext) {
    const {
      request: { body },
    } = ctx

    try {
      const [swaggerJSON, realConfig] = await Promise.all([loadSwaggerJSON(), config])

      const result = await Promise.all(
        (body as { path: string; method: string }[]).map(async (item) => {
          const curPath = swaggerJSON.paths[item.path as string]
          const tsCode = curPath[item.method as string].tsCode

          const realPath = realConfig?.patchPath
            ? realConfig.patchPath(item.path, swaggerJSON)
            : `${swaggerJSON.basePath}/${item.path}`

          const filePath = `${process.cwd()}/src${`${realConfig?.filePath ? realConfig?.filePath(realPath) : realPath}${
            Object.keys(curPath).length > 1 ? `-${(item.method as string).toLocaleLowerCase()}` : ''
          }.ts`}`

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
            .filter((d) => d.status === 'ok')
            .map((item) => {
              return execa('eslint', ['--fix', item.filePath], {
                stdio: 'inherit',
                cwd: process.cwd(),
              })
            })
        )
      } catch {
        //
      }

      const disabledResult = result.filter((d) => d.status === 'disabled')

      ctx.body = {
        status: true,
        message: disabledResult.length
          ? `${disabledResult.map((d) => `${d.method.toUpperCase()}: ${d.path}`).join('、')}禁止被覆盖已跳过`
          : '同步成功',
      }
    } catch {
      ctx.body = {
        status: false,
        message: '请先加载接口文档',
      }
    }
  }

  async getCodegen(ctx: ParameterizedContext) {
    const codegen = (await config)?.codegen || {}
    ctx.body = Object.keys(codegen).map((key) => ({ key, name: codegen[key].name }))
  }

  async transformResult(ctx: ParameterizedContext) {
    const { template, data } = (await config)?.codegen?.[ctx.request.body.name]?.transform(ctx.request.body.input) || {}

    ctx.body = template ? formatCode(render(template, data)) : ''
  }
}

export default new ApiController()
