import parser from '@liuyang0826/openapi-parser'
import axios from 'axios'
import compressing from 'compressing'
import execa from 'execa'
import * as fs from 'fs-extra'
import { ParameterizedContext } from 'koa'
import colors from 'picocolors'
import { Language } from 'src'
import { getConfig, resolveCodegen, resolveLanguages } from '../common/config'
import { loadSwagger, findSwager } from '../common/swagger'
import { formatCode } from '../common/utils'

class ApiController {
  async resources(ctx: ParameterizedContext) {
    const address = ctx.query.address as string

    console.log(`${colors.bold('Pull swagger resources')}:  ${colors.green(address)}`)

    ctx.ok((await axios(address)).data)
  }

  async swagger(ctx: ParameterizedContext) {
    const address = ctx.query.address as string
    const suffix = ctx.query.suffix as string

    console.log(`${colors.bold('Pull swagger data')}:  ${colors.green(address + suffix)}`)

    ctx.ok(await loadSwagger({ address, suffix }))
  }

  async apiCode(ctx: ParameterizedContext) {
    const address = ctx.query.address as string
    const path = ctx.query.path as string
    const method = ctx.query.method as string
    const lang = ctx.query.lang as string

    const { patchPath } = await getConfig()
    const fullPath = patchPath?.(path, address) || path
    const { swagger } = (await findSwager({ fullPath, method })) || {}
    if (!swagger) return
    const program = parser(swagger, path, method)

    const realPath = (
      program?.pathVar ? `\`${fullPath.replace(/\{(.+?)\}/g, `\${pathVar["$1"]}`)}\`` : `"${fullPath}"`
    ).replace(/\/+/g, '/')

    let code = ''
    const render = program && (await resolveLanguages(lang))?.render
    code = (await render?.({ path: realPath, method, ...program })) || ''

    if (code) {
      try {
        code = formatCode(code)
      } catch (e) {
        console.log(e)
      }
    }

    ctx.ok(code)
  }

  async syncCode(ctx: ParameterizedContext) {
    const {
      request: { body },
      query,
    } = ctx

    const config = await getConfig()
    const { patchPath, filePath: getFilePath } = config
    const root = config.root ?? `${process.cwd()}/src`

    const result = await Promise.all(
      (body as { path: string; method: string; lang: string }[]).map(async ({ path, method, lang }) => {
        const fullPath = patchPath?.(path, query.address as string) || path
        const { swagger } = (await findSwager({ fullPath, method })) || {}
        if (!swagger) return
        const curPath = swagger.paths[path]
        if (!curPath) return
        const program = parser(swagger, path, method)
        if (!program) return

        const realPath = (
          program.pathVar ? `\`${fullPath.replace(/\{(.+?)\}/g, `\${pathVar["$1"]}`)}\`` : `"${fullPath}"`
        ).replace(/\/+/g, '/')

        const language = await resolveLanguages(lang)

        if (!language) return

        const { render, extension } = language
        let result = (await render?.({ path: realPath, method, ...program })) || ''

        if (result) {
          try {
            result = formatCode(result)
          } catch (e) {
            console.log(e)
          }
        }

        const filePath = `${root}/${getFilePath ? getFilePath(fullPath) : fullPath}${
          Object.keys(curPath).length > 1 ? `-${method.toLocaleLowerCase()}` : ''
        }.${extension}`.replace(/\/+/g, '/')

        // 检测是否禁止覆盖
        const isExists = await fs.pathExists(filePath)

        if (isExists) {
          const content = await fs.readFile(filePath, 'utf-8')

          if (/\/\*\s*swagger-no-overwrite\s*\*\//.test(content)) {
            return {
              status: 'disabled',
              filePath,
              method,
              path,
            }
          }
        } else {
          await fs.ensureFile(filePath)
        }

        await fs.writeFile(filePath, result, 'utf-8')

        return {
          status: 'ok',
          filePath,
          method,
          path,
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
    const [codegen, languages] = (await Promise.allSettled([resolveCodegen(), resolveLanguages()])).map((d) =>
      d.status === 'fulfilled' ? d.value : null
    )

    ctx.ok({
      codegen,
      address: (await getConfig()).address || [],
      languages: (languages as Language[])?.map((d) => d.type) || [],
    })
  }

  async codegen(ctx: ParameterizedContext) {
    const codegen = await resolveCodegen(ctx.request.body.key as string)
    let code = (await codegen?.render?.(ctx.request.body.model)) || ''

    if (code) {
      try {
        code = formatCode(
          code.replace(/<file-block(?:\s+path=(["'])(.+?)\1)?[^>]*>([\w\W]+?)<\/file-block>/g, (...value) =>
            value ? `// file-block-start: ${value[2]}\n${value[3]}\n// file-block-end: ${value[2]}\n` : ''
          )
        )
      } catch (e) {
        console.log(e)
      }
    }

    ctx.ok(code)
  }

  async download(ctx: ParameterizedContext) {
    const codegen = await resolveCodegen(ctx.request.body.key as string)
    let code = (await codegen?.render?.(ctx.request.body.model)) || ''
    if (!code) throw new Error('下载失败')
    const matches: string[] = code.match(/<file-block[^>]*>[\w\W]+?<\/file-block>/g) || []

    matches.forEach((match) => {
      code = code.replace(match, '').trim()
    })

    code = formatCode(code.replace(/<file-block[^>]*>([\w\W]+?)<\/file-block>/, (...value) => value[1]))
    const zipStream = new compressing.zip.Stream()

    // 同路径文件内容合并
    const files = matches.reduce((acc, match, index) => {
      let [, , path, content = ''] =
        match.match(/<file-block(?:\s+path=(["'])(.+?)\1)?[^>]*>([\w\W]+?)<\/file-block>/) || []

      try {
        content = formatCode(content)
        path = path || `file_${index + 1}`
      } catch (e) {
        console.log(e)
      }

      if (acc[path]) {
        acc[path] += `\n${content}`
      } else {
        acc[path] = content
      }

      return acc
    }, (code ? { 'Index.tsx': code } : {}) as Record<string, string>)

    Object.keys(files).forEach((path) => {
      zipStream.addEntry(Buffer.from(files[path]), { relativePath: path })
    })

    ctx.set('Content-Type', 'application/zip')
    ctx.set('Access-Control-Expose-Headers', 'Content-Disposition')
    ctx.set('Content-Disposition', 'attachment;filename=download.zip')
    ctx.body = zipStream
  }

  async syncComponent(ctx: ParameterizedContext) {
    const codegen = await resolveCodegen(ctx.request.body.key as string)
    const dir = ctx.request.body.dir as string
    if (!dir) throw new Error('同步失败')
    let code = (await codegen?.render?.(ctx.request.body.model)) || ''
    if (!code) throw new Error('同步失败')
    const matches: string[] = code.match(/<file-block[^>]*>[\w\W]+?<\/file-block>/g) || []

    matches.forEach((match) => {
      code = code.replace(match, '').trim()
    })

    code = formatCode(code.replace(/<file-block[^>]*>([\w\W]+?)<\/file-block>/, (...value) => value[1]))

    // 同路径文件内容合并
    const files = matches.reduce((acc, match, index) => {
      let [, , path, content = ''] =
        match.match(/<file-block(?:\s+path=(["'])(.+?)\1)?[^>]*>([\w\W]+?)<\/file-block>/) || []

      try {
        content = formatCode(content)
        path = path || `file_${index + 1}`
      } catch (e) {
        console.log(e)
      }

      if (acc[path]) {
        acc[path] += `\n${content}`
      } else {
        acc[path] = content
      }

      return acc
    }, (code ? { 'Index.tsx': code } : {}) as Record<string, string>)

    const config = await getConfig()
    const root = config.root ?? `${process.cwd()}/src`

    await Promise.all(
      Object.keys(files).map(async (relativePath) => {
        const filePath = `${root}/${dir}/${relativePath}`.replace(/\/+/g, '/')
        await fs.ensureFile(filePath)
        await fs.writeFile(filePath, files[relativePath])
      })
    )

    ctx.ok('同步成功')
  }
}

export default new ApiController()
