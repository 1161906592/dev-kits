import chokidar from 'chokidar'
import fs from 'fs-extra'
import Koa from 'koa'
import koaBody from 'koa-body'
import cors from 'koa2-cors'
import { dataDir, defaultConfigFile } from './constants'
import mockMiddleware from './middlewares/mock'
import router from './routes/routes'
import { updateConfig } from './utils/config'

const watcher = chokidar.watch(`${process.cwd()}/${defaultConfigFile}`)

watcher.on('change', async () => {
  updateConfig()
})

fs.ensureFileSync(`${dataDir}/.gitignore`)
fs.writeFileSync(`${dataDir}/.gitignore`, '*', 'utf-8')

const app = new Koa()
app.use(cors())
app.use(koaBody())
app.use(router.routes())
app.use(mockMiddleware())

app.listen('7788', () => {
  console.log(`server running at: http://localhost:${7788}`)
})
