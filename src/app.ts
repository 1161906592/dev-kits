import Koa from 'koa'
import koaBody from 'koa-body'
import cors from 'koa-cors'
import mockMiddleware from './middlewares/mock'
import router from './routes/routes'

const app = new Koa()
app.use(cors())
app.use(koaBody())
app.use(router.routes())
app.use(mockMiddleware())

app.listen('7788', () => {
  console.log(`server running at: http://localhost:${7788}`)
})
