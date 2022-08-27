import generate from '@babel/generator'
import {
  tsInterfaceBody,
  identifier,
  tsPropertySignature,
  tsTypeAnnotation,
  tsStringKeyword,
  addComment,
  tsNumberKeyword,
  tsTypeReference,
  TSTypeElement,
  tsArrayType,
  TSStringKeyword,
  TSNumberKeyword,
  TSArrayType,
  tsBooleanKeyword,
  TSBooleanKeyword,
  stringLiteral,
  tsObjectKeyword,
  TSObjectKeyword,
  TSTypeAnnotation,
  exportNamedDeclaration,
  tsInterfaceDeclaration,
  ExportNamedDeclaration,
  TSTypeReference,
  Identifier,
  TSInterfaceDeclaration,
  program,
  exportDefaultDeclaration,
  functionDeclaration,
  blockStatement,
  returnStatement,
} from '@babel/types'
import { render } from 'ejs'
import { IConfig } from '..'
import {
  Definition,
  DefinitionArrayItem,
  ExportFunctionOptions,
  JavaType,
  Parameter,
  Paths,
  RequestDefinition,
  Swagger,
} from '../types'
import { matchInterfaceName } from './utils'

function makeTsPropertySignature(name: string, tsTypeAnnotation: TSTypeAnnotation) {
  return tsPropertySignature(name.includes('-') ? stringLiteral(name) : identifier(name), tsTypeAnnotation)
}

function javaTypeToTsKeyword(
  javaType: JavaType,
  item?: DefinitionArrayItem
): TSStringKeyword | TSNumberKeyword | TSBooleanKeyword | TSArrayType | TSObjectKeyword | void {
  if (javaType === 'string') {
    return tsStringKeyword()
  }

  if (['number', 'integer'].includes(javaType)) {
    return tsNumberKeyword()
  }

  if (javaType === 'boolean') {
    return tsBooleanKeyword()
  }

  if (javaType === 'object') {
    return tsObjectKeyword()
  }

  if (javaType === 'array') {
    const tsKeyword = item?.$ref
      ? tsTypeReference(identifier(item.$ref))
      : item?.type
      ? javaTypeToTsKeyword(item?.type)
      : null

    if (tsKeyword) {
      return tsArrayType(tsKeyword)
    }
  }
}

function resolveInterface(
  ref: string,
  definitions: Record<string, Definition>,
  collector: ExportNamedDeclaration[],
  markRequired: boolean
) {
  if (!ref) return
  const interfaceName = matchInterfaceName(ref)
  if (collector.some((d) => (d.declaration as TSInterfaceDeclaration).id.name === interfaceName)) return
  const { properties, required = [] } = definitions[ref.substring('#/definitions/'.length)] || {}
  if (!properties) return

  const interfaceBody: Array<TSTypeElement> = []

  Object.keys(properties).forEach((propName) => {
    const { type, $ref, description, format, items } = properties[propName]

    const tsKeyword = $ref ? tsTypeReference(identifier($ref)) : type ? javaTypeToTsKeyword(type, items) : null

    if (!tsKeyword) {
      console.log(`the ${propName} attribute of the ${$ref} is ignored`)

      return
    }

    const node = {
      ...makeTsPropertySignature(propName, tsTypeAnnotation(tsKeyword)),
      optional: !markRequired || !required.includes(propName),
    }

    interfaceBody.push(
      description ? addComment(node, 'trailing', ` ${description}${format ? ` ${format}` : ''}`, true) : node
    )
  })

  collector.unshift(
    exportNamedDeclaration(
      tsInterfaceDeclaration(identifier(interfaceName), null, null, tsInterfaceBody(interfaceBody))
    )
  )

  interfaceBody.forEach((item) => {
    const refIdentifier = (((item.typeAnnotation?.typeAnnotation as TSArrayType).elementType as TSTypeReference)
      ?.typeName || (item.typeAnnotation?.typeAnnotation as TSTypeReference)?.typeName) as Identifier

    if (refIdentifier?.name) {
      resolveInterface(refIdentifier.name, definitions, collector, markRequired)
      refIdentifier.name = matchInterfaceName(refIdentifier.name)
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
  definitions: Record<string, Definition>
) {
  const collector: ExportNamedDeclaration[] = []

  const interfaceBody: Array<TSTypeElement> = []

  const interfaceName =
    toFirstUpperCase(name) + toFirstUpperCase(resolveType === 'path' ? 'pathVariables' : resolveType)

  parameters.forEach((parameter) => {
    const { name, description, required, type, schema } = parameter
    if (schema?.$ref || (schema?.type === 'array' && parameter.in !== 'query')) return // 复杂类型在requestBody
    if (resolveType === 'query' && pathVars.includes(name)) return // pathVars
    if (resolveType === 'path' && !(parameter.in !== 'path' && pathVars.includes(name))) return // query

    if (schema?.$ref) {
      resolveInterface(schema.$ref, definitions, collector, true)
    }

    const tsKeyword = schema?.$ref
      ? tsTypeReference(identifier(schema?.$ref))
      : type || schema?.type
      ? javaTypeToTsKeyword(type || schema?.type, schema?.items)
      : null

    if (!tsKeyword) {
      console.log(`the ${name} attribute of the ${interfaceName} is ignored`)

      return
    }

    const node = {
      ...makeTsPropertySignature(name, tsTypeAnnotation(tsKeyword)),
      optional: !required,
    }

    interfaceBody.push(description ? addComment(node, 'trailing', ` ${description}`, true) : node)
  })

  if (!interfaceBody.length) {
    return []
  }

  collector.push(
    exportNamedDeclaration(
      tsInterfaceDeclaration(identifier(interfaceName), null, null, tsInterfaceBody(interfaceBody))
    )
  )

  return collector
}

function resolveResponseBodyInterface(definition: RequestDefinition, definitions: Record<string, Definition>) {
  const $ref = definition.responses[200].schema?.$ref

  const collector: ExportNamedDeclaration[] = []

  if ($ref) {
    resolveInterface($ref, definitions, collector, false)
  }

  return collector
}

function resolveRequestBodyInterface(definition: RequestDefinition, definitions: Record<string, Definition>) {
  const collector: ExportNamedDeclaration[] = []
  let bodyTsTypeAnnotation: TSTypeAnnotation | undefined = undefined

  const item = definition.parameters?.find((d) => d.in === 'body' && (d.schema?.$ref || d.schema?.type === 'array'))

  if (!item) {
    return { collector, bodyTsTypeAnnotation }
  }

  let requestBody: string | undefined

  if (item.schema?.type === 'array') {
    if (item.schema?.items?.$ref) {
      resolveInterface(item.schema.items.$ref, definitions, collector, true)
      const name = (collector[collector.length - 1].declaration as TSInterfaceDeclaration)?.id.name

      if (name) {
        bodyTsTypeAnnotation = tsTypeAnnotation(tsArrayType(tsTypeReference(identifier(name))))
        requestBody = `${name}[]`
      }
    } else {
      const tsType = javaTypeToTsKeyword(item.schema.items?.type as JavaType)

      if (tsType) {
        bodyTsTypeAnnotation = tsTypeAnnotation(tsArrayType(tsType))
        requestBody = `${tsType}[]`
      }
    }
  } else {
    resolveInterface(item.schema?.$ref as string, definitions, collector, true)
    const name = (collector[collector.length - 1].declaration as TSInterfaceDeclaration)?.id.name

    if (name) {
      bodyTsTypeAnnotation = tsTypeAnnotation(tsTypeReference(identifier(name)))
      requestBody = `${name}[]`
    }
  }

  return { collector, bodyTsTypeAnnotation, requestBody }
}

function transformOperationId(operationId: string) {
  const index = operationId.indexOf('Using')

  return index === -1 ? operationId : operationId.slice(0, index)
}

function resolveQuery(pathVars: string[], definition: RequestDefinition, definitions: Record<string, Definition>) {
  return resolveQueryOrPath(
    pathVars,
    definition.parameters || [],
    transformOperationId(definition.operationId),
    'query',
    definitions
  )
}

function resolvePath(pathVars: string[], definition: RequestDefinition, definitions: Record<string, Definition>) {
  return resolveQueryOrPath(
    pathVars,
    definition.parameters || [],
    transformOperationId(definition.operationId),
    'path',
    definitions
  )
}

function resolveExportFunction(options: ExportFunctionOptions) {
  const { name, pathInterface, queryInterface, bodyTsTypeAnnotation } = options

  const functionBody = blockStatement([returnStatement(identifier('__function_body__'))])

  const tsApiFunctionNode = functionDeclaration(
    identifier(name),
    [
      pathInterface && {
        ...identifier('pathVariables'),
        typeAnnotation: tsTypeAnnotation(tsTypeReference(identifier(pathInterface))),
      },
      queryInterface && {
        ...identifier('query'),
        typeAnnotation: tsTypeAnnotation(tsTypeReference(identifier(queryInterface))),
      },
      bodyTsTypeAnnotation && {
        ...identifier('data'),
        typeAnnotation: bodyTsTypeAnnotation,
      },
    ].filter(Boolean) as Identifier[],
    functionBody,
    false,
    true
  )

  const jsApiFunctionNode = functionDeclaration(
    identifier(name),
    [
      pathInterface && identifier('pathVariables'),
      queryInterface && identifier('query'),
      bodyTsTypeAnnotation && identifier('data'),
    ].filter(Boolean) as Identifier[],
    functionBody,
    false,
    true
  )

  return { tsApiFunctionNode, jsApiFunctionNode }
}

function resolveProgram(paths: Paths, path: string, method: string, definitions: Record<string, Definition>) {
  const definition = paths[path][method]
  const name = transformOperationId(definition.operationId)
  const pathVars = path.match(/\{(.+?)\}/g)?.map((d) => d.slice(1, -1)) || []
  const pathExports = resolvePath(pathVars, definition, definitions)
  const queryExports = resolveQuery(pathVars, definition, definitions)

  const {
    collector: requestBodyExports,
    bodyTsTypeAnnotation,
    requestBody,
  } = resolveRequestBodyInterface(definition, definitions)

  const responseBodyExports = resolveResponseBodyInterface(definition, definitions)
  const pathInterface = (pathExports[pathExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id.name
  const queryInterface = (queryExports[queryExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id.name

  const responseBody = (responseBodyExports[responseBodyExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id
    .name

  const { tsApiFunctionNode, jsApiFunctionNode } = resolveExportFunction({
    name,
    pathInterface,
    queryInterface,
    bodyTsTypeAnnotation,
  })

  // 函数注释
  const { summary, description } = definition

  if (summary || description) {
    addComment(tsApiFunctionNode, 'leading', ` ${[summary, description].filter(Boolean).join(', ')}`, true)
    addComment(jsApiFunctionNode, 'leading', ` ${[summary, description].filter(Boolean).join(', ')}`, true)
  }

  const tsProgram = program(
    [
      pathExports,
      queryExports,
      requestBodyExports,
      responseBodyExports,
      tsApiFunctionNode,
      exportDefaultDeclaration(identifier(name)),
    ].flat()
  )

  const jsProgram = program([jsApiFunctionNode, exportDefaultDeclaration(identifier(name))].flat())

  return { tsProgram, jsProgram, responseBody, queryInterface, pathInterface, requestBody }
}

export function createCodeParser(swaggerJSON: Swagger, config?: IConfig) {
  const { patchPath, apiBeforeCode = '', apiFunctionCode = '' } = config || {}

  return (path: string, method: string) => {
    const { tsProgram, jsProgram, responseBody, queryInterface, pathInterface, requestBody } = resolveProgram(
      swaggerJSON.paths,
      path,
      method,
      swaggerJSON.definitions
    )

    const fullPath = (patchPath ? patchPath(path, swaggerJSON) : `${swaggerJSON.basePath}/${path}`).replace(/\/+/g, '/')

    const realPath = pathInterface ? `\`${fullPath.replace(/\{(.+?)\}/g, `\${pathVariables.$1}`)}\`` : `"${fullPath}"`

    return {
      tsCode: `${apiBeforeCode}\n${generate(tsProgram)
        .code.replace(
          'return __function_body__',
          render(apiFunctionCode, {
            path: realPath,
            responseBody,
            query: queryInterface,
            data: requestBody,
          })
        )
        .replace(/;/g, '')
        .replace(/\n\s*\n/g, '\n')}`,
      jsCode: `${apiBeforeCode}\n${generate(jsProgram)
        .code.replace(
          'return __function_body__',
          render(apiFunctionCode, {
            path: realPath,
            responseBody: null,
            query: queryInterface,
            data: requestBody,
          })
        )
        .replace(/;/g, '')
        .replace(/\n\s*\n/g, '\n')}`,
    }
  }
}
