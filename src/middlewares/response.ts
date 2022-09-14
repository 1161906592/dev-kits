import { Middleware } from 'koa'

export default function responseMiddleware(): Middleware {
  return async (ctx, next) => {
    ctx.ok = (data: unknown) => {
      ctx.body = {
        code: 0,
        data,
      }
    }

    ctx.fail = (message: string) => {
      ctx.body = {
        code: -1,
        message,
      }
    }

    try {
      await next()
    } catch (e: any) {
      console.log(e)
      ctx.fail(e.message)
    }
  }
}
