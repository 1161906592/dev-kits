import { Definition, Property, Swagger } from '../types'
import { config } from './config'

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
      ?.map((d) => d.split(/-+/)[0])
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

function resolveMockTemplate(ref = '', definitions: Record<string, Definition | undefined>, collectors: string[]) {
  if (!ref || collectors.includes(ref)) return
  collectors.push(ref)
  const deep = collectors.length
  const properties = definitions[ref.substring('#/definitions/'.length)]?.properties
  if (!properties) return

  const result: Record<string, unknown> = {}

  Object.keys(properties).forEach((propName) => {
    const property = properties[propName]
    if (!property) return
    const { type, $ref, items } = property

    result[type === 'array' ? `${propName}|${config?.mock?.listCount || 6}` : propName] =
      type === 'array'
        ? [
            items?.type
              ? toMockTemplate(propName, items, deep)
              : resolveMockTemplate(items?.$ref, definitions, collectors),
          ]
        : type
        ? (config?.mock?.template || toMockTemplate)(propName, property, deep)
        : $ref
        ? resolveMockTemplate($ref, definitions, collectors)
        : undefined

    collectors = collectors.slice(0, deep)
  })

  return result
}

export function createMockParser(swaggerJSON: Swagger) {
  return (path: string, method: string) => {
    return resolveMockTemplate(
      swaggerJSON.paths[path]?.[method]?.responses[200].schema?.$ref,
      swaggerJSON.definitions,
      []
    )
  }
}
