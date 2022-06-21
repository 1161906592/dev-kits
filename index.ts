import axios from "axios"
import Koa from "koa"
import koaBody from "koa-body"
import cors from "koa-cors"
import koaStatic from "koa-static"
import LruCache from "lru-cache"
import { mock } from "mockjs"
import { createCodeParser } from "./codePaser"
import { createMockParser } from "./mockPaser"
import swaggerJSON from "./swagger.json"
import { Paths, Swagger } from "./types"

const paths = swaggerJSON.paths as unknown as Paths

const app = new Koa()

function sleep(timeout: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, timeout)
  })
}

const lruCache = new LruCache<string, any>({
  max: 1024 * 4,
})

app.use(cors())
app.use(koaBody())

// 获取swagger配置
app.use(async (ctx, next) => {
  if (ctx.headers["x-use-mock"]) {
    return await next()
  }

  if (ctx.path === "/swagger/parseResult") {
    const url = ctx.query.url as string
    const refresh = ctx.query.refresh as string

    if (refresh === "1" || !lruCache.get(url)) {
      const { data } = await axios.get<Swagger>(url)
      const codeParser = createCodeParser(data as unknown as Swagger)
      const mockParser = createMockParser(data as unknown as Swagger)

      Object.keys(paths).forEach((path) => {
        Object.keys(paths[path]).forEach((method) => {
          const { tsCode, jsCode } = codeParser(path, method)
          paths[path][method].tsCode = tsCode
          paths[path][method].jsCode = jsCode
          paths[path][method].mockTemplate = JSON.stringify(mockParser(path, method), null, 2)
          paths[path][method].mockJSON = JSON.stringify(mock(mockParser(path, method)), null, 2)
        })
      })

      lruCache.set(url, data)
    }

    ctx.body = JSON.stringify(lruCache.get(url))
  } else if (ctx.path === "/swagger/mockConfig" && ctx.method === "POST") {
    const {
      request: { body },
    } = ctx

    lruCache.set((body.url as string) + body.method + body.type, body.config)
    ctx.body = 0
  } else if (ctx.path === "/swagger/mockConfig" && ctx.method === "GET") {
    const { query } = ctx
    const cacheResult = lruCache.get((query.url as string) + query.method + query.type)

    if (cacheResult) {
      ctx.body = cacheResult
    }
  }
})

// mock接口
app.use(async (ctx, next) => {
  if (!ctx.headers["x-use-mock"]) {
    return await next()
  }

  const cacheMockJSON = lruCache.get(ctx.path + ctx.method.toLocaleLowerCase() + 1)

  if (cacheMockJSON) {
    await sleep(Number(ctx.headers["x-mock-timeout"]) || 0)
    ctx.body = cacheMockJSON

    return
  }

  const cache = lruCache.get("swagger")
  const responseBody = cache?.paths[ctx.path]?.[ctx.method.toLocaleLowerCase()]?.responseBody

  if (!responseBody) {
    return await next()
  }

  await sleep(Number(ctx.headers["x-mock-timeout"]) || 0)
  ctx.body = ""
})

app.use(koaStatic(`${__dirname}/static`))

app.listen("7788", () => {
  console.log(`server running at: http://localhost:${7788}`)
})
