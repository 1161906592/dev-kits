import parser from '@liuyang0826/openapi-parser'
import axios from 'axios'
import { render } from 'ejs'
import execa from 'execa'
import * as fs from 'fs-extra'
import { ParameterizedContext } from 'koa'
import colors from 'picocolors'
import { config } from '../common/config'
import { findCodegen, formatCode } from '../common/utils'

class ApiController {
  async resources(ctx: ParameterizedContext) {
    const url = ctx.query.url as string

    console.log(`${colors.bold('Pull swagger resources')}:  ${colors.green(url)}`)

    ctx.ok((await axios(url)).data)
  }

  async swagger(ctx: ParameterizedContext) {
    const url = ctx.query.url as string

    console.log(`${colors.bold('Pull swagger data')}:  ${colors.green(url)}`)

    ctx.ok((await ctx.state.loadSwagger(url)).swagger)
  }

  async apiCode(ctx: ParameterizedContext) {
    const path = ctx.query.path as string
    const method = ctx.query.method as string
    const lang = ctx.query.lang as string

    const swagger = (await ctx.state.loadSwagger()).swagger
    if (!swagger) throw ''
    const { tsApi, jsApi, patchPath } = config || {}
    const program = parser(swagger, path, method)

    const fullPath = patchPath ? patchPath(path, ctx.state.getAddress()) : path

    const realPath = (
      program?.pathVar ? `\`${fullPath.replace(/\{(.+?)\}/g, `\${pathVar["$1"]}`)}\`` : `"${fullPath}"`
    ).replace(/\/+/g, '/')

    let result = ''
    const data = { path: realPath, method, ...program }

    if (lang === 'javascript') {
      result = program && jsApi ? render(await jsApi(), data) : ''
    } else {
      result = program && tsApi ? render(await tsApi(), data) : ''
    }

    ctx.ok(formatCode(result))
  }

  async syncCode(ctx: ParameterizedContext) {
    const {
      request: { body },
    } = ctx

    const swagger = (await ctx.state.loadSwagger()).swagger
    if (!swagger) throw ''
    const { tsApi, patchPath } = config || {}

    const result = await Promise.all(
      (body as { path: string; method: string }[]).map(async (item) => {
        const curPath = swagger.paths[item.path as string]
        if (!curPath) return
        const program = parser(swagger, item.path, item.method)
        if (!program) return

        const fullPath = patchPath ? patchPath(item.path, ctx.state.getAddress()) : item.path

        const realPath = (
          program?.pathVar ? `\`${fullPath.replace(/\{(.+?)\}/g, `\${pathVar["$1"]}`)}\`` : `"${fullPath}"`
        ).replace(/\/+/g, '/')

        const tsCode = tsApi && formatCode(render(await tsApi(), { path: realPath, method: item.method, ...program }))
        if (!tsCode) return

        const filePath = `${process.cwd()}/src${`${(config?.filePath ? config.filePath(fullPath) : fullPath).replace(
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

    ctx.ok(
      disabledResult.length
        ? `${disabledResult.map((d) => `${d?.method.toUpperCase()}: ${d?.path}`).join('、')}禁止被覆盖已跳过`
        : '同步成功'
    )
  }

  async config(ctx: ParameterizedContext) {
    const { codegen = [], address = [] } = config || {}

    ctx.ok({
      codegen,
      address,
    })
  }

  async codegen(ctx: ParameterizedContext) {
    const key = ctx.request.body.key
    const codegen = findCodegen(config?.codegen || [], key)

    const { template, data } = (await codegen?.transform?.(ctx.request.body.input, ctx.request.body.options)) || {}

    ctx.ok(template ? formatCode(render(template, data)) : '')
  }
}

export default new ApiController()
