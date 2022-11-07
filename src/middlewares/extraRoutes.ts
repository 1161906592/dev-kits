import { Middleware } from 'koa'
import { getRouter } from '../common/config'
import { internalPrefix } from '../constants'

export default function extraRoutesMiddleware(): Middleware {
  return async (ctx, next) => {
    if (ctx.path.startsWith(`${internalPrefix}/extra`)) {
      ctx.path = ctx.path.substring(`${internalPrefix}/extra`.length)
      await getRouter()?.routes()(ctx as any, next)
    }
  }
}
