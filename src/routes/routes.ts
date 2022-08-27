import KoaRouter from 'koa-router'
import api from '../controllers/ApiController'

const router = new KoaRouter({ prefix: '/swagger' })

router.get('/parseResult', api.getParseResult)

router.post('/mockConfig', api.updateMockConfig)

router.post('/syncCode', api.syncCode)

router.get('/codegen', api.getCodegen)

router.post('/transformResult', api.transformResult)

export default router
