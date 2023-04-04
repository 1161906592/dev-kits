import { MockOptions } from '..'
import { getConfig } from './config'

function toMockTemplate(name: string, property: any, deep: number): unknown {
  if (deep === 1 && name === 'code') {
    return 0
  }

  if (property?.enum) {
    return `@pick([${property.enum.join(', ')}])`
  }

  const { type } = property

  if (type !== 'boolean' && property?.description && /\d+-\S+/.test(property.description)) {
    return `@pick([${property.description
      .match(/\d+-\S+/g)
      ?.map((d: string) => d.split(/-+/)[0])
      .join(', ')}])`
  }

  if (type === 'string') {
    return property?.format === 'date-time' ? '@now(yyyy-MM-dd) @date(HH:mm:ss)' : '@ctitle(2, 8)'
  }

  if (type === 'number' || type === 'integer') {
    return '@integer(0, 1000)'
  }

  if (type === 'boolean') {
    return '@boolean()'
  }

  if (type === 'object') {
    return {}
  }
}

function resolveMockTemplate(
  ref = '',
  definitions: Record<string, any | undefined>,
  collectors: string[],
  mock: MockOptions | undefined
) {
  if (!ref || collectors.includes(ref)) return
  collectors.push(ref)
  const deep = collectors.length

  const properties = ref.startsWith('#/definitions/')
    ? definitions[ref.substring('#/definitions/'.length)]?.properties // v2
    : definitions[ref.substring('#/components/schemas/'.length)]?.properties // v3

  if (!properties) return
  const result: Record<string, unknown> = {}

  Object.keys(properties).forEach((propName) => {
    const property = properties[propName]
    if (!property) return
    const { type, $ref, items } = property

    result[type === 'array' ? `${propName}|${mock?.listCount || 6}` : propName] =
      type === 'array'
        ? [
            items?.type
              ? toMockTemplate(propName, items, deep)
              : resolveMockTemplate(items?.$ref, definitions, collectors, mock),
          ]
        : type
        ? (mock?.template || toMockTemplate)(propName, property, deep)
        : $ref
        ? resolveMockTemplate($ref, definitions, collectors, mock)
        : undefined

    collectors = collectors.slice(0, deep)
  })

  return result
}

export async function mockParser(swagger: any, path: string, method: string) {
  const mock = (await getConfig())?.mock

  if (swagger.definitions) {
    return resolveMockTemplate(
      swagger.paths[path]?.[method]?.responses[200].schema?.$ref,
      swagger.definitions,
      [],
      mock
    )
  }

  return resolveMockTemplate(
    (Object.values(swagger.paths[path]?.[method]?.responses[200]?.content || {})[0] as any)?.schema?.$ref,
    swagger.components.schemas,
    [],
    mock
  )
}

export async function scriptParser(swagger: any, path: string, method: string) {
  const mock = (await getConfig())?.mock

  if (swagger.definitions) {
    return `export default ({ Mockjs, cache }) => {
      return Mockjs.mock(${JSON.stringify(
        resolveMockTemplate(swagger.paths[path]?.[method]?.responses[200].schema?.$ref, swagger.definitions, [], mock),
        null,
        2
      )})
    }`
  }

  return `export default ({ Mockjs, cache }) => {
    return Mockjs.mock(${JSON.stringify(
      resolveMockTemplate(
        (Object.values(swagger.paths[path]?.[method]?.responses[200]?.content || {})[0] as any)?.schema?.$ref,
        swagger.components.schemas,
        [],
        mock
      ),
      null,
      2
    )})
  }`
}
