import KoaRouter from 'koa-router'
import api from '../controllers/ApiController'

const router = new KoaRouter({ prefix: '/__swagger__' })

router.get('/swagger', api.swagger)

router.get('/config', api.config)

router.post('/updateMock', api.updateMock)

router.post('/syncCode', api.syncCode)

router.post('/codegen', api.codegen)

export default router
