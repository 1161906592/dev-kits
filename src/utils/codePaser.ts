import { render } from 'ejs'
import colors from 'picocolors'
import { IConfig } from '..'
import {
  Definition,
  DefinitionArrayItem,
  InterfaceItem,
  JavaType,
  Parameter,
  Paths,
  PropItem,
  RequestDefinition,
  Swagger,
} from '../types'
import { formatCode, matchInterfaceName } from './utils'

function fixName(name: string) {
  return name.includes('-') ? `"${name}"` : name
}

function javaTypeToTsKeyword(javaType: JavaType, item?: DefinitionArrayItem): string | void {
  if (['number', 'integer'].includes(javaType)) return 'number'

  if (['string', 'boolean', 'object'].includes(javaType)) return javaType

  if (javaType === 'array') {
    const tsKeyword = item?.$ref ? item.$ref : item?.type ? javaTypeToTsKeyword(item.type) : null

    if (tsKeyword) return `${tsKeyword}[]`
  }
}

function resolveInterface(
  ref: string,
  definitions: Record<string, Definition | undefined>,
  collector: InterfaceItem[],
  markRequired: boolean
) {
  const interfaceName = matchInterfaceName(ref)
  if (collector.some((d) => d.name === interfaceName)) return
  const { properties, required = [] } = definitions[ref.substring('#/definitions/'.length)] || {}
  if (!properties) return
  const interfaceBody: PropItem[] = []

  Object.keys(properties).forEach((propName) => {
    const property = properties[propName]

    if (!property) {
      console.log(`\nthe ${colors.red(colors.bold(propName))} attribute is not found`)

      return
    }

    const { type, $ref, description, format, items } = property
    const tsKeyword = $ref ? $ref : type ? javaTypeToTsKeyword(type, items) : null

    if (!tsKeyword) {
      console.log(`\nthe ${colors.red(colors.bold(propName))} attribute of the ${$ref} is ignored`)

      return
    }

    interfaceBody.push({
      name: fixName(propName),
      required: markRequired && required.includes(propName),
      type: tsKeyword || '',
      description,
      format,
    })
  })

  collector.unshift({
    name: interfaceName,
    props: interfaceBody,
  })

  interfaceBody.forEach((item) => {
    if (item.type.startsWith('#/definitions')) {
      const ref = item.type.split(/(\[.*\])?$/)[0]
      resolveInterface(ref, definitions, collector, markRequired)
      item.type = item.type.replace(/.*?(\[.*\])?$/, `${matchInterfaceName(item.type)}$1`)
    }
  })
}

function toFirstUpperCase(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function resolveQueryOrPath(
  pathVars: string[],
  parameters: Parameter[],
  name: string,
  resolveType: 'query' | 'path',
  definitions: Record<string, Definition | undefined>
) {
  const collector: InterfaceItem[] = []
  const interfaceBody: PropItem[] = []

  const interfaceName = toFirstUpperCase(name) + toFirstUpperCase(resolveType === 'path' ? 'pathVariable' : resolveType)

  parameters.forEach((parameter) => {
    const { name, description, required, type, schema, format } = parameter
    if (schema?.$ref || (schema?.type === 'array' && parameter.in !== 'query')) return // 复杂类型在requestBody
    if (resolveType === 'query' && pathVars.includes(name)) return // pathVars
    if (resolveType === 'path' && !(parameter.in !== 'path' && pathVars.includes(name))) return // query

    if (schema?.$ref) {
      resolveInterface(schema.$ref, definitions, collector, true)
    }

    const tsKeyword = schema?.$ref
      ? schema.$ref
      : type || schema?.type
      ? javaTypeToTsKeyword(type || schema?.type, schema?.items)
      : null

    if (!tsKeyword) {
      console.log(`\nthe ${colors.red(colors.bold(name))} attribute of the ${interfaceName} is ignored`)

      return
    }

    interfaceBody.push({
      name: fixName(name),
      required,
      type: tsKeyword || '',
      description,
      format,
    })
  })

  interfaceBody.length &&
    collector.push({
      name: interfaceName,
      props: interfaceBody,
    })

  return collector
}

function resolveResponseBodyInterface(
  definition: RequestDefinition,
  definitions: Record<string, Definition | undefined>
) {
  const $ref = definition.responses[200].schema?.$ref
  const collector: InterfaceItem[] = []
  $ref && resolveInterface($ref, definitions, collector, false)

  return collector
}

function resolveRequestBodyInterface(
  definition: RequestDefinition,
  definitions: Record<string, Definition | undefined>
) {
  const collector: InterfaceItem[] = []

  const item = definition.parameters?.find((d) => d.in === 'body' && (d.schema?.$ref || d.schema?.type === 'array'))

  if (!item) return { collector }

  let requestBody: string | undefined

  if (item.schema?.type === 'array') {
    if (item.schema?.items?.$ref) {
      resolveInterface(item.schema.items.$ref, definitions, collector, true)
      const name = collector.at(-1)?.name

      if (name) {
        requestBody = `${name}[]`
      }
    } else {
      const tsType = javaTypeToTsKeyword(item.schema.items?.type as JavaType)

      if (tsType) {
        requestBody = `${tsType}[]`
      }
    }
  } else {
    resolveInterface(item.schema?.$ref as string, definitions, collector, true)
    requestBody = collector.at(-1)?.name
  }

  return { collector, requestBody }
}

function transformOperationId(operationId: string) {
  const index = operationId.indexOf('Using')

  return index === -1 ? operationId : operationId.slice(0, index)
}

function resolveQuery(
  pathVars: string[],
  definition: RequestDefinition,
  definitions: Record<string, Definition | undefined>
) {
  return resolveQueryOrPath(
    pathVars,
    definition.parameters || [],
    transformOperationId(definition.operationId),
    'query',
    definitions
  )
}

function resolvePath(
  pathVars: string[],
  definition: RequestDefinition,
  definitions: Record<string, Definition | undefined>
) {
  return resolveQueryOrPath(
    pathVars,
    definition.parameters || [],
    transformOperationId(definition.operationId),
    'path',
    definitions
  )
}

function resolveProgram(
  paths: Paths,
  path: string,
  method: string,
  definitions: Record<string, Definition | undefined>
) {
  const definition = paths[path]?.[method]
  if (!definition) return
  const name = transformOperationId(definition.operationId)
  const pathVars = path.match(/\{(.+?)\}/g)?.map((d) => d.slice(1, -1)) || []

  const pathInterfaces = resolvePath(pathVars, definition, definitions)
  const pathVariable = pathInterfaces.at(-1)?.name

  const queryInterfaces = resolveQuery(pathVars, definition, definitions)
  const query = queryInterfaces.at(-1)?.name

  const { collector: requestBodyInterfaces, requestBody } = resolveRequestBodyInterface(definition, definitions)

  const responseBodyInterfaces = resolveResponseBodyInterface(definition, definitions)
  const responseBody = responseBodyInterfaces.at(-1)?.name

  const { summary, description } = definition
  const comment = [summary, description].filter(Boolean).join(', ')

  return {
    name,
    comment,
    requestBodyInterfaces,
    requestBody,
    pathInterfaces,
    pathVariable,
    queryInterfaces,
    query,
    responseBodyInterfaces,
    responseBody,
  }
}

function renderApiCode(apiTemplate: string, data: Record<string, unknown>) {
  return formatCode(render(apiTemplate, data))
}

export function createCodeParser(swaggerJSON: Swagger, config?: IConfig) {
  const { patchPath, apiTemplate = '' } = config || {}

  return (path: string, method: string) => {
    const program = resolveProgram(swaggerJSON.paths, path, method, swaggerJSON.definitions)
    if (!program) return

    const {
      name,
      comment,
      pathInterfaces,
      pathVariable,
      queryInterfaces,
      query,
      requestBodyInterfaces,
      requestBody,
      responseBodyInterfaces,
      responseBody,
    } = program

    const fullPath = (patchPath ? patchPath(path, swaggerJSON) : `${swaggerJSON.basePath}/${path}`).replace(/\/+/g, '/')

    const realPath = pathVariable ? `\`${fullPath.replace(/\{(.+?)\}/g, `\${pathVariable["$1"]}`)}\`` : `"${fullPath}"`

    return {
      tsCode: renderApiCode(apiTemplate, {
        name,
        comment,
        interfaces: [...pathInterfaces, ...queryInterfaces, ...requestBodyInterfaces, ...responseBodyInterfaces],
        args: [
          pathVariable && `pathVariable: ${pathVariable}`,
          query && `query: ${query}`,
          requestBody && `data: ${requestBody}`,
        ]
          .filter(Boolean)
          .join(', '),
        path: realPath,
        method: `"${method}"`,
        responseBody,
        query,
        data: requestBody,
      }),
      jsCode: renderApiCode(apiTemplate, {
        name,
        comment,
        interfaces: [],
        args: [pathVariable && 'pathVariable', query && 'query', requestBody && 'data'].filter(Boolean).join(', '),
        path: realPath,
        method: `"${method}"`,
        responseBody: null,
        query,
        data: requestBody,
      }),
    }
  }
}
