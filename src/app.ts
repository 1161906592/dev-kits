import http from 'http'
import cors from '@koa/cors'
import chokidar from 'chokidar'
import fs from 'fs-extra'
import Koa from 'koa'
import koaBody from 'koa-body'
import colors from 'picocolors'
import { parseConfig } from './common/config'
import { pathMock } from './common/pathMock'
import { dataDir, defaultConfigFile } from './constants'
import mockMiddleware from './middlewares/mock'
import proxyMiddleware from './middlewares/proxy'
import swaggerMiddleware from './middlewares/swagger'
import router from './routes/routes'

pathMock()
fs.ensureDir(dataDir)

parseConfig()
const watcher = chokidar.watch(`${process.cwd()}/${defaultConfigFile}`)

watcher.on('change', async () => {
  parseConfig()
})

const app = new Koa()
const server = http.createServer(app.callback())
// 代理中间件最高优先级
app.use(proxyMiddleware(server, watcher))
app.use(cors())
app.use(swaggerMiddleware())
app.use(mockMiddleware())
app.use(koaBody())
app.use(router.routes())

server.listen('7788', () => {
  console.log(`${colors.green('➜')} ${colors.bold(` Swagger server ready`)}:  ${colors.cyan(`http://127.0.0.1:7788/`)}`)
})
