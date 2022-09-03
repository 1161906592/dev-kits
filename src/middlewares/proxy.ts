import { Server } from 'node:http'
import { parse } from 'node:url'
import httpProxy from 'http-proxy'
import { Middleware } from 'koa'
import colors from 'picocolors'
import { WebSocket, WebSocketServer } from 'ws'
import { config } from '../utils/config'
import { loadMockCode } from '../utils/utils'

const logger = (type: string, from: string, to: string) =>
  console.log(`\n${colors.bold(type)}:  ${colors.green(from)} -> ${colors.cyan(to)}`)

export default function proxyMiddleware(server: Server): Middleware {
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

  const ws = new WebSocketServer({
    noServer: true,
  })

  // 连接
  const socketMap = new Map<string, Set<WebSocket>>()

  ws.on('connection', (socket, req) => {
    const { pathname } = parse(req.url || '')
    if (!pathname) return
    let socketSet = socketMap.get(pathname)

    if (!socketSet) {
      socketSet = new Set()
      socketMap.set(pathname, socketSet)
    }

    socketSet.add(socket)

    console.log(
      `\n${colors.bold('Websocket connection')}:  ${colors.cyan(pathname)}  当前连接数: ${colors.cyan(socketSet.size)}`
    )

    const remove = (type: string) => {
      socketSet?.delete(socket)

      console.log(
        `\n${colors.bold(`Websocket ${type}`)}:  ${colors.cyan(pathname)}  当前连接数: ${colors.cyan(socketSet?.size)}`
      )

      if (!socketSet?.size) {
        stopPush(pathname)
        socketMap.delete(pathname)
      }
    }

    socket.on('close', () => remove('close'))

    socket.on('error', () => remove('error'))

    startPush(pathname)
  })

  const timerMap = new Map<string, NodeJS.Timer>()

  const startPush = (path: string) => {
    if (timerMap.get(path)) return
    console.log(`\n${colors.bold('Websocket startPush')}:  ${colors.cyan(path)}`)

    const loop = async () => {
      const socketSet = socketMap.get(path)
      if (!socketSet?.size) return stopPush(path)
      const code = await loadMockCode(path, 'ws', 'ws')

      if (!code || !socketSet.size) return stopPush(path)

      socketSet.forEach((socket) => {
        socket.send(code)
      })

      timerMap.set(
        path,
        setTimeout(() => loop(), 1000)
      )
    }

    loop()
  }

  const stopPush = (path: string) => {
    const timer = timerMap.get(path)

    if (timer) {
      console.log(`\n${colors.bold('Websocket stopPush')}:  ${colors.cyan(path)}`)
      clearTimeout(timer)
      timerMap.delete(path)
    }
  }

  const isPushing = (path: string) => {
    return !!timerMap.get(path)
  }

  // websocket
  server.on('upgrade', (req, socket, head) => {
    const options = config?.proxy || {}
    const opts = options.websocket

    if (opts) {
      for (const context in opts) {
        if (doesProxyContextMatchUrl(context, req.url || '')) {
          if (options.isPass && options.isPass(req.url || '', address)) {
            // mock
            ws.handleUpgrade(req, socket, head, (socket) => {
              ws.emit('connection', socket, req)
            })
          } else {
            // proxy
            if (options.rewrite) {
              const originUrl = req.url || ''
              req.url = options.rewrite(originUrl, address.slice(0, -'/v2/api-docs'.length))
              req.url !== originUrl && logger('Websocket', originUrl, req.url)
            }

            logger('Websocket', req.url || '', opts[context])
            proxy.ws(req, socket, head, { target: opts[context], ...proxy })
          }

          return
        }
      }
    }

    socket.destroy()
  })

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
      if (options.isPass && options.isPass(ctx.path || '', address)) {
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

    ctx.state.ws = {
      startPush,
      stopPush,
      isPushing,
    }

    await next()
  }
}

function doesProxyContextMatchUrl(context: string, url: string): boolean {
  return (context.startsWith('^') && new RegExp(context).test(url)) || url.startsWith(context)
}
