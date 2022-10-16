import KoaRouter from '@koa/router'
import api from '../controller/ApiController'
import mock from '../controller/MockController'
import ws from '../controller/WSController'

const router = new KoaRouter({ prefix: '/__swagger__' })

router.get('/api/resources', api.resources)
router.get('/api/swagger', api.swagger)
router.get('/api/config', api.config)
router.get('/api/apiCode', api.apiCode)
router.get('/api/getFormFieldsByKey', api.getFormFieldsByKey)
router.post('/api/syncCode', api.syncCode)
router.post('/api/codegen', api.codegen)

router.get('/mock/mockCode', mock.mockCode)
router.post('/mock/updateMock', mock.updateMock)
router.post('/mock/resetMock', mock.resetMock)

router.get('/ws/records', ws.records)
router.post('/ws/save', ws.save)
router.post('/ws/remove', ws.remove)

export default router
