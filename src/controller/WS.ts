import { ParameterizedContext } from 'koa'
import { loadMockCode, loadWSRecords, removeMockCode, saveMockCode, saveWSRecords } from '../common/repository'
import { transformCode } from '../common/utils'

class WSController {
  async records(ctx: ParameterizedContext) {
    const records = await loadWSRecords()

    ctx.ok(
      (
        await Promise.all(
          records.map(async (path) => {
            const content = await loadMockCode(path, 'ws', 'ws')
            if (!content) return
            const { raw, interval } = JSON.parse(content)

            return {
              path,
              code: raw,
              interval: String(interval),
            }
          })
        )
      ).filter(Boolean)
    )
  }

  async save(ctx: ParameterizedContext) {
    const { path, prevPath, code, interval } = ctx.request.body || {}

    const records = await loadWSRecords()
    const isAdd = !records.includes(path)
    if (isAdd) records.push(path)
    const changedPath = prevPath && path !== prevPath

    if (changedPath) {
      const index = records.findIndex((d) => d === prevPath)
      if (index !== -1) records.splice(index, 1)
    }

    await Promise.all([
      (isAdd || changedPath) && saveWSRecords(records),
      changedPath && removeMockCode(prevPath, 'ws', 'ws'),
      saveMockCode(
        path,
        'ws',
        'ws',
        JSON.stringify({ raw: code, code: await transformCode(code), interval: parseInt(interval) })
      ),
    ])

    changedPath && ctx.state.stopPush(prevPath)

    ctx.state.startPush(path)

    ctx.ok()
  }

  async remove(ctx: ParameterizedContext) {
    const path = ctx.query.path as string
    const records = await loadWSRecords()
    const index = records.findIndex((d) => d === path)
    if (index !== -1) records.splice(index, 1)
    await Promise.all([index !== -1 && saveWSRecords(records), removeMockCode(path, 'ws', 'ws')])
    ctx.state.stopPush(path)

    ctx.ok()
  }
}

export default new WSController()
