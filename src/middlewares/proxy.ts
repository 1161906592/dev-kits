// import { Server } from 'node:http'
import httpProxy from 'http-proxy'
import { Middleware } from 'koa'
import colors from 'picocolors'
import { config } from '../utils/config'

const logger = (type: string, from: string, to: string) =>
  console.log(`\n${colors.bold(type)}:  ${colors.green(from)} -> ${colors.cyan(to)}`)

export default function proxyMiddleware(): Middleware {
  // 当前文档地址
  let address = ''

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

  // websocket
  // if (httpServer) {
  //   httpServer.on('upgrade', (req, socket, head) => {
  //     const options = config?.proxy
  //     if (!options) return
  //     const url = req.url!

  //     if ((options.ws || opts.target?.toString().startsWith('ws:')) && req.headers['sec-websocket-protocol']) {
  //       if (options.rewrite) {
  //         req.url = options.rewrite(url, address)
  //       }

  //       console.log(`${req.url} -> ws ${opts.target}`)
  //       proxy.ws(req, socket, head, { target: new URL(address).origin, ...proxy })

  //       return
  //     }
  //   })
  // }

  return async (ctx, next) => {
    const { req, res, path, query } = ctx

    if (path.startsWith('/__swagger__')) {
      await next()

      if (path === '/__swagger__/swagger' && ctx.body) {
        address = query.url as string
      }

      return
    }

    const options = config?.proxy || {}

    if (address) {
      if (options.isPass && options.isPass(req.url || '', address)) {
        return await next()
      }

      if (options.rewrite) {
        const originUrl = req.url || ''
        req.url = options.rewrite(originUrl, address.slice(0, -'/v2/api-docs'.length))
        req.url !== originUrl && logger('Rewrite', originUrl, req.url)
      }

      const opts = { target: new URL(address).origin, ...proxy }
      logger('Proxy', req.url || '', opts.target)

      return await new Promise<void>((resolve) => proxy.web(req, res, opts, () => resolve()))
    }

    await next()
  }
}
