import { render } from 'ejs'
import execa from 'execa'
import * as fs from 'fs-extra'
import { ParameterizedContext } from 'koa'
import colors from 'picocolors'
import { createCodeParser } from '../common/codePaser'
import { config } from '../common/config'
import { findCodegen, formatCode } from '../common/utils'

class ApiController {
  async swagger(ctx: ParameterizedContext) {
    const url = ctx.query.url as string

    console.log(`${colors.bold('Pull swagger')}:  ${colors.green(url)}`)

    try {
      ctx.body = {
        status: true,
        data: (await ctx.state.loadSwagger(url)).swagger,
      }
    } catch (e) {
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
      const swagger = (await ctx.state.loadSwagger()).swagger
      if (!swagger) throw ''

      const codeParser = createCodeParser(swagger, config)

      ctx.body = {
        status: true,
        data: codeParser(path, method),
      }
    } catch (e) {
      console.error(e)

      ctx.body = {
        status: false,
        message: '请先加载接口文档',
      }
    }
  }

  async syncCode(ctx: ParameterizedContext) {
    const {
      request: { body },
    } = ctx

    try {
      const swagger = (await ctx.state.loadSwagger()).swagger
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
      console.error(e)

      ctx.body = {
        status: false,
        mesaage: '生成失败',
      }
    }
  }
}

export default new ApiController()
