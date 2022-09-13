import { ParameterizedContext } from 'koa'
import { Project } from '../models'

class ProjectController {
  async list(ctx: ParameterizedContext) {
    try {
      ctx.ok(await Project.findAll())
    } catch (e) {
      console.log(e)
      ctx.fail('项目查询失败')
    }
  }

  async addOrUpdate(ctx: ParameterizedContext) {
    try {
      if (ctx.request.body.id) {
        await Project.update(ctx.request.body, {
          where: {
            id: ctx.request.body.id,
          },
        })
      } else {
        await Project.create(ctx.request.body)
      }

      ctx.ok()
    } catch (e) {
      console.log(e)
      ctx.fail('操作失败')
    }
  }

  async remove(ctx: ParameterizedContext) {
    try {
      await Project.destroy({
        where: {
          id: ctx.querys.id,
        },
      })

      ctx.ok()
    } catch (e) {
      console.log(e)
      ctx.fail('操作失败')
    }
  }
}

export default new ProjectController()
