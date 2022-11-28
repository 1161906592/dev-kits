import { Definition, Property, SwaggerV2, SwaggerV3 } from '@liuyang0826/openapi-parser'
import { MockOptions } from '..'
import { getConfig } from './config'

function toMockTemplate(name: string, property: Property, deep: number): unknown {
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
  definitions: Record<string, Definition | undefined>,
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

export async function mockParser(swagger: SwaggerV2 | SwaggerV3, path: string, method: string) {
  const mock = (await getConfig())?.mock

  if ((swagger as SwaggerV2).definitions) {
    return resolveMockTemplate(
      (swagger as SwaggerV2).paths[path]?.[method]?.responses[200].schema?.$ref,
      (swagger as SwaggerV2).definitions,
      [],
      mock
    )
  }

  return resolveMockTemplate(
    Object.values((swagger as SwaggerV3).paths[path]?.[method]?.responses[200]?.content || {})[0]?.schema?.$ref,
    (swagger as SwaggerV3).components.schemas,
    [],
    mock
  )
}

export async function scriptParser(swagger: SwaggerV2 | SwaggerV3, path: string, method: string) {
  const mock = (await getConfig())?.mock

  if ((swagger as SwaggerV2).definitions) {
    return `export default ({ Mockjs }) => {
      return Mockjs.mock(${JSON.stringify(
        resolveMockTemplate(
          (swagger as SwaggerV2).paths[path]?.[method]?.responses[200].schema?.$ref,
          (swagger as SwaggerV2).definitions,
          [],
          mock
        ),
        null,
        2
      )})
    }`
  }

  return `export default ({ Mockjs }) => {
    return Mockjs.mock(${JSON.stringify(
      resolveMockTemplate(
        Object.values((swagger as SwaggerV3).paths[path]?.[method]?.responses[200]?.content || {})[0]?.schema?.$ref,
        (swagger as SwaggerV3).components.schemas,
        [],
        mock
      ),
      null,
      2
    )})
  }`
}
