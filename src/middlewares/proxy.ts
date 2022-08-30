import httpProxy from 'http-proxy'
import { Middleware } from 'koa'
import colors from 'picocolors'
import { config } from '../utils/config'

export default function proxyMiddleware(): Middleware {
  // 当前文档地址
  let curAddress = ''

  const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
  })

  proxy.on('error', (err, _, originalRes) => {
    const res = originalRes

    if ('req' in res) {
      console.error(`${colors.red(`http proxy error:`)}\n${err.stack}`, {
        timestamp: true,
        error: err,
      })

      if (!res.headersSent && !res.writableEnded) {
        res
          .writeHead(500, {
            'Content-Type': 'text/plain',
          })
          .end()
      }
    } else {
      console.error(`${colors.red(`ws proxy error:`)}\n${err.stack}`, {
        timestamp: true,
        error: err,
      })

      res.end()
    }
  })

  return async (ctx, next) => {
    if (ctx.path.startsWith('/__swagger__')) {
      if (ctx.path === '/__swagger__/swagger') {
        curAddress = ctx.query.url as string
      }

      return next()
    }

    const options = config?.proxy

    if (options && curAddress) {
      if (options.bypass) {
        const bypassResult = options.bypass(ctx.req, ctx.res, options)

        if (typeof bypassResult === 'string') {
          ctx.req.url = bypassResult

          return next()
        } else if (typeof bypassResult === 'object') {
          Object.assign(options, bypassResult)

          return next()
        } else if (bypassResult === false) {
          return ctx.res.end(404)
        }
      }

      if (options.rewrite) {
        ctx.req.url = options.rewrite(ctx.url, curAddress.slice(0, -'/v2/api-docs'.length))
      }

      return await new Promise<void>((resolve) => {
        proxy.web(ctx.req, ctx.res, { target: new URL(curAddress).origin, ...proxy }, () => {
          resolve()
        })
      })
    }

    next()
  }
}
