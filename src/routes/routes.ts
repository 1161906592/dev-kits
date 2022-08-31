import KoaRouter from 'koa-router'
import api from '../controllers/ApiController'

const router = new KoaRouter({ prefix: '/__swagger__' })

router.get('/swagger', api.swagger)
router.get('/config', api.config)

router.get('/apiCode', api.apiCode)
router.post('/syncCode', api.syncCode)

router.get('/mockCode', api.mockCode)
router.post('/updateMock', api.updateMock)
router.post('/resetMock', api.resetMock)

router.post('/codegen', api.codegen)

export default router
