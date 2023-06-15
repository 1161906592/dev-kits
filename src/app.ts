import http from 'http'
import cors from '@koa/cors'
import chokidar from 'chokidar'
import fs from 'fs-extra'
import { getPort } from 'get-port-please'
import Koa from 'koa'
import koaBody from 'koa-body'
import colors from 'picocolors'
import { parseConfig } from './common/config'
import patchMock from './common/patchMock'
import { dataDir, configFile, extensions } from './constants'
import extraRoutesMiddleware from './middlewares/extraRoutes'
import mockMiddleware from './middlewares/mock'
import proxyMiddleware from './middlewares/proxy'
import responseMiddleware from './middlewares/response'
import router from './routes/routes'

export async function startServer() {
  patchMock()
  fs.ensureDir(dataDir)

  parseConfig()
  const watcher = chokidar.watch(`./${configFile}.{${extensions.join(',')}}`)
  watcher.on('change', () => parseConfig())

  const app = new Koa()
  const server = http.createServer(app.callback())
  // 代理中间件最高优先级
  app.use(proxyMiddleware(server, watcher))
  app.use(cors())
  app.use(mockMiddleware())
  app.use(koaBody())
  app.use(responseMiddleware())
  app.use(router.routes())
  app.use(extraRoutesMiddleware())

  const port = await getPort(51965)

  // fixed port
  server.listen(port, () => {
    console.log(`${colors.green('➜')} ${colors.bold(` Dev-kits ready`)}:  ${colors.cyan(`http://127.0.0.1:${port}/`)}`)
  })

  return port
}
