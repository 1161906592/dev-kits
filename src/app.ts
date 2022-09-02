import chokidar from 'chokidar'
import fs from 'fs-extra'
import Koa from 'koa'
import koaBody from 'koa-body'
import cors from 'koa2-cors'
import colors from 'picocolors'
import { dataDir, defaultConfigFile } from './constants'
import mockMiddleware from './middlewares/mock'
import proxyMiddleware from './middlewares/proxy'
import router from './routes/routes'
import { parseConfig } from './utils/config'
import { pathMock } from './utils/pathMock'

const watcher = chokidar.watch(`${process.cwd()}/${defaultConfigFile}`)

parseConfig()

watcher.on('change', async () => {
  parseConfig()
})

pathMock()

fs.ensureFileSync(`${dataDir}/.gitignore`)
fs.writeFileSync(`${dataDir}/.gitignore`, '*', 'utf-8')

const app = new Koa()
// 代理中间件最高优先级
app.use(proxyMiddleware())
app.use(cors())
app.use(mockMiddleware())
app.use(koaBody())
app.use(router.routes())

app.listen('7788', () => {
  console.log(`${colors.green('➜')} ${colors.bold(` Swagger server ready`)}:  ${colors.cyan(`http://127.0.0.1:7788/`)}`)
})
