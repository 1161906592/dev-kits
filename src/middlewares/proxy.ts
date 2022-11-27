import { Server } from 'node:http'
import { FSWatcher } from 'chokidar'
import httpProxy from 'http-proxy'
import { Middleware } from 'koa'
import colors from 'picocolors'
import { WebSocket, WebSocketServer } from 'ws'
import { getConfig } from '../common/config'
import { loadMockCode } from '../common/repository'
import { findSwager } from '../common/swagger'
import { runScriptInSandbox } from '../common/utils'

const logger = (type: string, from: string, to: string) =>
  console.log(`${colors.bold(type)}:  ${colors.green(from)} -> ${colors.cyan(to)}`)

export default function proxyMiddleware(server: Server, watcher: FSWatcher): Middleware {
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
    const url = req.url || ''
    if (!url) return
    let socketSet = socketMap.get(url)

    if (!socketSet) {
      socketSet = new Set()
      socketMap.set(url, socketSet)
    }

    socketSet.add(socket)

    console.log(
      `${colors.bold('Websocket connection')}:  ${colors.cyan(url)}  当前连接数: ${colors.cyan(socketSet.size)}`
    )

    const remove = (type: string) => {
      socketSet?.delete(socket)

      console.log(
        `${colors.bold(`Websocket ${type}`)}:  ${colors.cyan(url)}  当前连接数: ${colors.cyan(socketSet?.size)}`
      )

      if (!socketSet?.size) {
        stopPush(url)
        socketMap.delete(url)
      }
    }

    socket.on('close', () => remove('close'))
    socket.on('error', () => remove('error'))

    startPush(url)
  })

  const timerMap = new Map<string, NodeJS.Timer>()

  watcher.on('change', async () => {
    const options = (await getConfig())?.proxy || {}
    const opts = options.websocket

    if (opts && Object.keys(opts).length) {
      Array.from(socketMap.keys()).forEach((url) => {
        for (const context in opts) {
          if (doesProxyContextMatchUrl(context, url)) {
            const item = opts[context]
            const target = typeof item === 'string' ? item : item.target?.toString()

            if (!target?.startsWith('ws') || !options.isPass || !options.isPass(url)) {
              // 断开连接
              socketMap.get(url)?.forEach((socket) => socket.close())
              socketMap.delete(url)
            }

            return
          }
        }
      })
    } else {
      // 全部断开
      socketMap.forEach((socketSet) => {
        socketSet.forEach((socket) => socket.close())
      })

      socketMap.clear()
    }
  })

  const startPush = (path: string) => {
    if (timerMap.get(path)) return

    const push = async () => {
      const socketSet = socketMap.get(path)
      if (!socketSet?.size) return stopPush(path)
      let content

      try {
        // todo 待优化
        content = await loadMockCode(path, 'ws', 'ws')
      } catch (e) {
        console.error(e)
      }

      if (!content || !socketSet.size) return stopPush(path)
      const { interval, code } = JSON.parse(content)
      console.log(`${colors.bold('Websocket push')}:  ${colors.cyan(path)}`)

      try {
        const data = JSON.stringify(
          // todo 待优化
          await runScriptInSandbox(code)({ Mockjs: require('mockjs'), dayjs: require('dayjs') })
        )

        socketSet.forEach((socket) => {
          socket.send(data)
        })
      } catch (e) {
        console.error(e)
      } finally {
        timerMap.set(
          path,
          setTimeout(() => push(), interval)
        )
      }
    }

    push()
  }

  const stopPush = (path: string) => {
    const timer = timerMap.get(path)

    if (timer) {
      console.log(`${colors.bold('Websocket stopPush')}:  ${colors.cyan(path)}`)
      clearTimeout(timer)
      timerMap.delete(path)
    }
  }

  // websocket
  server.on('upgrade', async (req, socket, head) => {
    const options = (await getConfig())?.proxy || {}
    const opts = options.websocket

    if (opts) {
      for (const context in opts) {
        const item = opts[context]
        const target = typeof item === 'string' ? item : item.target?.toString()

        if (!target?.toString().startsWith('ws')) {
          console.log(`${colors.red(target?.toString())} is not a websocket url!`)

          continue
        }

        if (doesProxyContextMatchUrl(context, req.url || '')) {
          if (options.isPass && options.isPass(req.url || '')) {
            // mock
            ws.handleUpgrade(req, socket, head, (socket) => {
              ws.emit('connection', socket, req)
            })
          } else {
            // proxy
            if (typeof item !== 'string' && item.rewrite) {
              const originUrl = req.url || ''
              req.url = item.rewrite(originUrl)
              req.url !== originUrl && logger('Websocket rewrite', originUrl, req.url)
            }

            logger('Websocket proxy', req.url || '', target)
            proxy.ws(req, socket, head, { target: opts[context], ...options })
          }

          return
        }
      }
    }

    socket.destroy()
  })

  return async (ctx, next) => {
    const { req, res, path } = ctx
    ctx.state.startPush = startPush
    ctx.state.stopPush = stopPush

    if (path.startsWith('/__swagger__')) return await next()
    const options = (await getConfig())?.proxy || {}

    if (options.isPass && options.isPass(ctx.path || '')) {
      return await next()
    }

    const { address } = (await findSwager({ fullPath: ctx.path, method: ctx.method })) || {}
    if (!address) return

    if (options.rewrite) {
      const originUrl = req.url || ''
      req.url = options.rewrite(originUrl, address)
      req.url !== originUrl && logger('Proxy rewrite', originUrl, req.url)
    }

    const opts = { target: new URL(address).origin, ...options }
    logger('Proxy', req.url || '', opts.target.toString())

    return await new Promise<void>((resolve) => proxy.web(req, res, opts, () => resolve()))
  }
}

function doesProxyContextMatchUrl(context: string, url: string): boolean {
  return (context.startsWith('^') && new RegExp(context).test(url)) || url.startsWith(context)
}
