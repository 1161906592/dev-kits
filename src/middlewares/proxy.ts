import { Server } from 'node:http'
import { FSWatcher } from 'chokidar'
import httpProxy from 'http-proxy'
import { Middleware } from 'koa'
import colors from 'picocolors'
import { WebSocket, WebSocketServer } from 'ws'
import { config } from '../common/config'
import { loadMockCode } from '../common/repository'
import { runScriptInSandbox } from '../common/utils'

const logger = (type: string, from: string, to: string) =>
  console.log(`${colors.bold(type)}:  ${colors.green(from)} -> ${colors.cyan(to)}`)

export default function proxyMiddleware(server: Server, watcher: FSWatcher): Middleware {
  // 当前文档地址
  let address = ''

  const setAddress = (_address: string) => {
    address = _address
  }

  const getAddress = () => address

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

  watcher.on('change', () => {
    const options = config?.proxy || {}
    const opts = options.websocket

    if (opts) {
      Array.from(socketMap.keys()).forEach((url) => {
        for (const context in opts) {
          if (doesProxyContextMatchUrl(context, url)) {
            if (!opts[context].startsWith('ws') || !options.isPass || !options.isPass(url, address)) {
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
  server.on('upgrade', (req, socket, head) => {
    const options = config?.proxy || {}
    const opts = options.websocket

    if (opts) {
      for (const context in opts) {
        if (!opts[context].startsWith('ws')) {
          console.log(`${colors.red(opts[context])} is not a websocket url!`)

          continue
        }

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
              req.url !== originUrl && logger('Websocket rewrite', originUrl, req.url)
            }

            logger('Websocket proxy', req.url || '', opts[context])
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
    ctx.state.setAddress = setAddress
    ctx.state.getAddress = getAddress
    ctx.state.startPush = startPush
    ctx.state.stopPush = stopPush

    if (path.startsWith('/__swagger__')) return await next()

    const options = config?.proxy || {}

    if (address) {
      if (options.isPass && options.isPass(ctx.path || '', address)) {
        return await next()
      }

      if (options.rewrite) {
        const originUrl = req.url || ''
        req.url = options.rewrite(originUrl, address.slice(0, -'/v2/api-docs'.length))
        req.url !== originUrl && logger('Proxy rewrite', originUrl, req.url)
      }

      const opts = { target: new URL(address).origin, ...options }
      logger('Proxy', req.url || '', opts.target.toString())

      return await new Promise<void>((resolve) => proxy.web(req, res, opts, () => resolve()))
    }

    await next()
  }
}

function doesProxyContextMatchUrl(context: string, url: string): boolean {
  return (context.startsWith('^') && new RegExp(context).test(url)) || url.startsWith(context)
}
