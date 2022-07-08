import axios from "axios"
import execa from "execa"
import * as fs from "fs-extra"
import Koa from "koa"
import koaBody from "koa-body"
import cors from "koa-cors"
import koaStatic from "koa-static"
import { mock } from "mockjs"
import { createCodeParser } from "./codePaser"
import { createMockParser } from "./mockPaser"
import { Swagger } from "./types"

const dataDir = `${process.cwd()}/.swagger`
fs.ensureFileSync(`${dataDir}/.gitignore`)
fs.writeFileSync(`${dataDir}/.gitignore`, "*", "utf-8")

const app = new Koa()

function sleep(timeout: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, timeout)
  })
}

async function loadSwaggerJSON() {
  return JSON.parse(await fs.readFile(`${dataDir}/api.json`, "utf-8")) as Swagger
}

async function saveSwaggerJSON(swaggerJSON: string) {
  await fs.ensureFile(`${dataDir}/api.json`)
  await fs.writeFile(`${dataDir}/api.json`, swaggerJSON, "utf-8")
}

app.use(cors())
app.use(koaBody())

// 获取swagger配置
app.use(async (ctx, next) => {
  // 获取文档数据
  if (ctx.path === "/swagger/parseResult") {
    const url = ctx.query.url as string
    const refresh = ctx.query.refresh as string

    if (refresh === "1") {
      const { data } = await axios.get<Swagger>(url)
      const codeParser = createCodeParser(data)
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

      return
    }

    try {
      ctx.body = await loadSwaggerJSON()
    } catch {
      ctx.body = "请先加载接口文档"
    }

    return
  }

  if (ctx.path === "/swagger/mockConfig" && ctx.method === "POST") {
    const {
      request: { body },
    } = ctx

    try {
      const swaggerJSON = await loadSwaggerJSON()
      const cur = swaggerJSON.paths[body.url][body.method]

      if (body.type === "mockJSON") {
        cur.mockJSON = body.config
      } else {
        cur.mockTemplate = body.config
      }

      await saveSwaggerJSON(JSON.stringify(swaggerJSON, null, 2))
      ctx.body = "修改成功"
    } catch {
      ctx.body = "请先加载接口文档"
    }

    return
  }

  if (ctx.path === "/swagger/mockConfig" && ctx.method === "GET") {
    const { query } = ctx

    if (query) {
      ctx.body = query
    }

    return
  }

  if (ctx.path === "/swagger/writeDisk" && ctx.method === "POST") {
    const {
      request: { body },
    } = ctx

    try {
      const swaggerJSON = await loadSwaggerJSON()
      const curPath = swaggerJSON.paths[body.url as string]

      if (!curPath) {
        ctx.body = "没有对应接口代码"

        return
      }

      const tsCode = curPath[body.method as string].tsCode

      if (!tsCode) {
        ctx.body = "没有对应接口代码"

        return
      }

      const filePath = `${process.cwd()}/src${body.url}${
        Object.keys(curPath).length > 1 ? `-${(body.method as string).toLocaleLowerCase()}` : ""
      }.ts`

      // 检测是否禁止覆盖
      const isExists = await fs.pathExists(filePath)

      if (isExists) {
        const content = await fs.readFile(filePath, "utf-8")

        if (/\/\*\s*swagger-no-overwrite\s*\*\//.test(content)) {
          ctx.body = {
            status: false,
            message: "此接口已存在并且禁止被覆盖",
          }

          return
        }
      } else {
        await fs.ensureFile(filePath)
      }

      await fs.writeFile(filePath, tsCode, "utf-8")

      try {
        // 同步项目的eslint格式
        await execa("eslint", ["--fix", filePath], {
          stdio: "inherit",
          cwd: process.cwd(),
        })
      } catch (e) {
        console.log(e)
      }

      ctx.body = {
        status: true,
        message: "同步成功",
      }
    } catch {
      ctx.body = {
        status: false,
        message: "请先加载接口文档",
      }
    }

    return
  }

  await next()
})

// mock接口
app.use(async (ctx, next) => {
  if (!ctx.path.startsWith("/api") || !ctx.headers["x-mock-type"]) {
    await next()

    return
  }

  try {
    const swaggerJSON = require("./api.json") as Swagger

    if (ctx.headers["x-mock-type"] === "mock") {
      const mockTemplate = swaggerJSON.paths[ctx.path][ctx.method.toLocaleLowerCase()].mockTemplate

      if (mockTemplate) {
        await sleep(Number(ctx.headers["x-mock-timeout"]) || 0)
        ctx.body = mock(JSON.parse(mockTemplate))

        return
      }
    }

    if (ctx.headers["x-mock-type"] === "json") {
      const mockJSON = swaggerJSON.paths[ctx.path][ctx.method.toLocaleLowerCase()].mockJSON

      if (mockJSON) {
        await sleep(Number(ctx.headers["x-mock-timeout"]) || 0)
        ctx.body = mockJSON

        return
      }
    }
  } catch {
    ctx.body = "请先加载接口文档"
  }

  await next()
})

app.use(koaStatic(`${__dirname}/static`))

app.listen("7788", () => {
  console.log(`server running at: http://localhost:${7788}`)
})
