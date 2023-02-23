import KoaRouter from '@koa/router'
import { internalPrefix } from '../constants'
import api from '../controller/Api'
import mock from '../controller/Mock'
import ws from '../controller/WS'

const router = new KoaRouter({ prefix: internalPrefix })

router.get('/api/resources', api.resources)
router.get('/api/swagger', api.swagger)
router.get('/api/config', api.config)
router.get('/api/apiCode', api.apiCode)
router.post('/api/syncCode', api.syncCode)
router.post('/api/codegen', api.codegen)
router.post('/api/download', api.download)
router.post('/api/syncComponent', api.syncComponent)

router.get('/mock/mockCode', mock.mockCode)
router.post('/mock/updateMock', mock.updateMock)
router.post('/mock/resetMock', mock.resetMock)

router.get('/ws/records', ws.records)
router.post('/ws/save', ws.save)
router.post('/ws/remove', ws.remove)

export default router
