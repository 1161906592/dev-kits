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

const app = new Koa()

function sleep(timeout: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, timeout)
  })
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

      const result = JSON.stringify(data, null, 2)
      fs.writeFileSync(`${__dirname}/swagger.json`, result, "utf-8")
      ctx.body = result

      return
    }

    try {
      ctx.body = require("./swagger.json")
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
      const swaggerJSON = require("./swagger.json") as Swagger
      const cur = swaggerJSON.paths[body.url][body.method]

      if (body.type === "mockJSON") {
        cur.mockJSON = body.config
      } else {
        cur.mockTemplate = body.config
      }

      fs.writeFileSync(`${__dirname}/swagger.json`, JSON.stringify(swaggerJSON, null, 2), "utf-8")
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
      const swaggerJSON = require("./swagger.json") as Swagger
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

      await fs.ensureFile(filePath)
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

      ctx.body = "写入成功"
    } catch {
      ctx.body = "请先加载接口文档"
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
    const swaggerJSON = require("./swagger.json") as Swagger

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
