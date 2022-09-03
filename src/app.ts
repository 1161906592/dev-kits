import http from 'http'
import chokidar from 'chokidar'
import Koa from 'koa'
import koaBody from 'koa-body'
import cors from 'koa2-cors'
import colors from 'picocolors'
import { defaultConfigFile } from './constants'
import mockMiddleware from './middlewares/mock'
import proxyMiddleware from './middlewares/proxy'
import router from './routes/routes'
import { parseConfig } from './utils/config'
import { pathMock } from './utils/pathMock'

const watcher = chokidar.watch(`${process.cwd()}/${defaultConfigFile}`)

parseConfig()
pathMock()

watcher.on('change', async () => {
  parseConfig()
})

const app = new Koa()
const server = http.createServer(app.callback())
// 代理中间件最高优先级
app.use(proxyMiddleware(server))
app.use(cors())
app.use(mockMiddleware())
app.use(koaBody())
app.use(router.routes())

server.listen('7788', () => {
  console.log(`${colors.green('➜')} ${colors.bold(` Swagger server ready`)}:  ${colors.cyan(`http://127.0.0.1:7788/`)}`)
})
