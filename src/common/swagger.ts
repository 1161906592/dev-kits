import { SwaggerV2, SwaggerV3 } from '@liuyang0826/openapi-parser'
import axios from 'axios'
import { getConfig } from './config'

const swaggerRecords: {
  address: string
  loader: Promise<{
    swagger: SwaggerV2 | SwaggerV3 | null
    pathMap: Record<string, Record<string, unknown> | undefined>
    varPaths: { regExp: RegExp; methods: Record<string, unknown> | undefined }[]
  }>
}[] = []

export async function loadSwagger(options: { address: string; suffix: string }) {
  const { address, suffix } = options
  const patchPath = getConfig()?.patchPath

  const loader = axios.get<SwaggerV2 | SwaggerV3>(address + suffix).then((res) => {
    const pathMap: Record<string, Record<string, unknown> | undefined> = {}
    const varPaths: { regExp: RegExp; methods: Record<string, unknown> | undefined }[] = []

    Object.keys(res.data.paths).forEach((path) => {
      const fullPath = patchPath?.(path, address) || path

      if (/\{(.+?)\}/.test(fullPath)) {
        varPaths.push({
          regExp: new RegExp(`^${fullPath.replace(/\{.+?\}/g, '[^/]+')}`),
          methods: res.data.paths[path],
        })
      } else {
        pathMap[fullPath] = res.data.paths[path]
      }
    })

    return { swagger: res.data, pathMap, varPaths }
  })

  const index = swaggerRecords.findIndex((d) => d.address === address)

  if (index !== -1) {
    swaggerRecords.splice(index, 1)
  }

  swaggerRecords.unshift({ address, loader })

  if (swaggerRecords.length > (getConfig()?.maxSize || 30)) {
    swaggerRecords.pop()
  }

  return (await loader).swagger
}

export async function findSwager(options: { fullPath: string; method: string }) {
  const { fullPath, method } = options

  for (let index = 0; index < swaggerRecords.length; index += 1) {
    const { loader, address } = swaggerRecords[index]
    const { swagger, pathMap, varPaths } = await loader
    const lowerCaseMethod = method.toLowerCase()

    if (
      pathMap[fullPath]?.[lowerCaseMethod] ||
      varPaths.find((d) => d.regExp.test(fullPath))?.methods?.[lowerCaseMethod]
    ) {
      return { address, swagger }
    }
  }
}
