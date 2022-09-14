import * as Koa from 'koa'

declare module 'koa' {
  interface ExtendableContext extends Koa.ExtendableContext {
    ok(data?: unknown): void
    fial(message: string): void
  }
}
