import axios from 'axios'
import { getConfig } from './config'

const swaggerRecords: {
  address: string
  loader: Promise<{
    swagger: any
    pathMap: Record<string, { methods: Record<string, unknown> | undefined; path: string } | undefined>
    varPaths: { regExp: RegExp; methods: Record<string, unknown> | undefined; path: string }[]
  }>
}[] = []

export async function loadSwagger(options: { address: string; suffix: string }) {
  const { address, suffix } = options
  const patchPath = (await getConfig())?.patchPath

  const loader = axios.get<any>(address + suffix).then((res) => {
    const pathMap: Record<string, { methods: Record<string, unknown> | undefined; path: string } | undefined> = {}
    const varPaths: { regExp: RegExp; methods: Record<string, unknown> | undefined; path: string }[] = []

    Object.keys(res.data.paths).forEach((path) => {
      const fullPath = patchPath?.(path, address).replace(/\/+/g, '/') || path

      if (/\{(.+?)\}/.test(fullPath)) {
        varPaths.push({
          regExp: new RegExp(`^${fullPath.replace(/\{.+?\}/g, '[^/]+')}`),
          methods: res.data.paths[path],
          path,
        })
      } else {
        pathMap[fullPath] = { methods: res.data.paths[path], path }
      }
    })

    return { swagger: res.data, pathMap, varPaths }
  })

  const index = swaggerRecords.findIndex((d) => d.address === address)

  if (index !== -1) {
    swaggerRecords.splice(index, 1)
  }

  swaggerRecords.unshift({ address, loader })

  if (swaggerRecords.length > ((await getConfig())?.maxSize || 30)) {
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

    let item = pathMap[fullPath]

    if (item) {
      return { address, swagger, path: item?.path }
    }

    item = varPaths.find((d) => d.regExp.test(fullPath))

    if (item?.methods?.[lowerCaseMethod]) {
      return { address, swagger, path: item.path }
    }
  }
}
