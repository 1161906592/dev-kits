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
  importSpecifier,
  importDeclaration,
  exportDefaultDeclaration,
  templateLiteral,
  templateElement,
  memberExpression,
  functionDeclaration,
  blockStatement,
  variableDeclaration,
  variableDeclarator,
  awaitExpression,
  callExpression,
  objectExpression,
  objectProperty,
  ObjectProperty,
  returnStatement,
  tsAsExpression,
  Program,
} from '@babel/types'
import {
  Definition,
  DefinitionArrayItem,
  ExportFunctionOptions,
  JavaType,
  Parameter,
  Paths,
  RequestDefinition,
  Swagger,
} from './types'
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
    const { type, $ref, description, items } = properties[propName]

    const tsKeyword = $ref ? tsTypeReference(identifier($ref)) : type ? javaTypeToTsKeyword(type, items) : null

    if (!tsKeyword) {
      console.log(`the ${propName} attribute of the ${$ref} is ignored`)

      return
    }

    const node = {
      ...makeTsPropertySignature(propName, tsTypeAnnotation(tsKeyword)),
      optional: !markRequired || !required.includes(propName),
    }

    interfaceBody.push(description ? addComment(node, 'trailing', ` ${description}`, true) : node)
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
    if (!((resolveType === 'query' && !schema?.$ref) || parameter.in === resolveType)) return

    if (schema?.$ref) {
      resolveInterface(schema.$ref, definitions, collector, true)
    }

    const tsKeyword = schema?.$ref
      ? tsTypeReference(identifier(schema?.$ref))
      : type || schema?.type
      ? javaTypeToTsKeyword((type || schema?.type) as JavaType)
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

  definition.parameters
    ?.filter((d) => d.in === 'body' && d.schema?.$ref)
    .forEach((d) => resolveInterface(d.schema?.$ref as string, definitions, collector, true))

  return collector
}

function transformOperationId(operationId: string) {
  const index = operationId.indexOf('Using')

  return index === -1 ? operationId : operationId.slice(0, index)
}

function resolveQuery(definition: RequestDefinition, definitions: Record<string, Definition>) {
  return resolveQueryOrPath(
    definition.parameters || [],
    transformOperationId(definition.operationId),
    'query',
    definitions
  )
}

function resolvePath(definition: RequestDefinition, definitions: Record<string, Definition>) {
  return resolveQueryOrPath(
    definition.parameters || [],
    transformOperationId(definition.operationId),
    'path',
    definitions
  )
}

function resolveExportFunction(options: ExportFunctionOptions) {
  const { parameters, name, path, method, pathInterface, queryInterface, bodyInterface, responseBody } = options
  const pathVariableParameters = parameters.filter((d) => d.in === 'path')

  // 处理路径参数的url
  const urlValueNode = pathVariableParameters.length
    ? templateLiteral(
        path
          .split(new RegExp(`{(?:${pathVariableParameters.map((d) => d.name).join('|')})}`))
          .map((d, i, arr) => templateElement({ raw: d, cooked: d }, i === arr.length - 1)),
        pathVariableParameters.map((d) => {
          const computed = d.name.includes('-')

          return memberExpression(
            identifier('pathVariables'),
            computed ? stringLiteral(d.name) : identifier(d.name),
            computed
          )
        })
      )
    : stringLiteral(path)

  const createBlockStatementNode = (isTs: boolean) =>
    blockStatement([
      variableDeclaration('const', [
        variableDeclarator(
          identifier('res'),
          awaitExpression(
            callExpression(identifier('request'), [
              objectExpression(
                [
                  objectProperty(identifier('url'), urlValueNode),
                  objectProperty(identifier('method'), stringLiteral(method)),
                  queryInterface && objectProperty(identifier('params'), identifier('query')),
                  bodyInterface && objectProperty(identifier('data'), identifier('data'), false, true),
                ].filter(Boolean) as ObjectProperty[]
              ),
            ])
          )
        ),
      ]),
      returnStatement(
        isTs && responseBody
          ? tsAsExpression(
              memberExpression(identifier('res'), identifier('data')),
              tsTypeReference(identifier(responseBody))
            )
          : memberExpression(identifier('res'), identifier('data'))
      ),
    ])

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
      bodyInterface && {
        ...identifier('data'),
        typeAnnotation: tsTypeAnnotation(tsTypeReference(identifier(bodyInterface))),
      },
    ].filter(Boolean) as Identifier[],
    createBlockStatementNode(true),
    false,
    true
  )

  const jsApiFunctionNode = functionDeclaration(
    identifier(name),
    [
      pathInterface && identifier('pathVariables'),
      queryInterface && identifier('query'),
      bodyInterface && identifier('data'),
    ].filter(Boolean) as Identifier[],
    createBlockStatementNode(false),
    false,
    true
  )

  return { tsApiFunctionNode, jsApiFunctionNode }
}

function resolveProgram(
  paths: Paths,
  path: string,
  method: string,
  definitions: Record<string, Definition>,
  basePath: string
) {
  const definition = paths[path][method]
  const name = transformOperationId(definition.operationId)
  const pathExports = resolvePath(definition, definitions)
  const queryExports = resolveQuery(definition, definitions)
  const requestBodyExports = resolveRequestBodyInterface(definition, definitions)
  const responseBodyExports = resolveResponseBodyInterface(definition, definitions)
  const pathInterface = (pathExports[pathExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id.name
  const queryInterface = (queryExports[queryExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id.name

  const bodyInterface = (requestBodyExports[requestBodyExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id
    .name

  const responseBody = (responseBodyExports[responseBodyExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id
    .name

  let realPath = (basePath + path).replace(/\/+/g, '/')

  if (!realPath.startsWith('/api')) {
    realPath = `/api${realPath}`
  }

  const { tsApiFunctionNode, jsApiFunctionNode } = resolveExportFunction({
    parameters: definition.parameters || [],
    name,
    path: realPath,
    method,
    pathInterface,
    queryInterface,
    bodyInterface,
    responseBody,
  })

  // 函数注释
  const { summary, description } = definition

  if (summary || description) {
    addComment(tsApiFunctionNode, 'leading', ` ${[summary, description].filter(Boolean).join(', ')}`, true)
    addComment(jsApiFunctionNode, 'leading', ` ${[summary, description].filter(Boolean).join(', ')}`, true)
  }

  const tsProgram = program(
    [
      importDeclaration([importSpecifier(identifier('request'), identifier('request'))], stringLiteral('@celi/shared')),
      pathExports,
      queryExports,
      requestBodyExports,
      responseBodyExports,
      tsApiFunctionNode,
      exportDefaultDeclaration(identifier(name)),
    ].flat()
  )

  const jsProgram = program(
    [
      importDeclaration([importSpecifier(identifier('request'), identifier('request'))], stringLiteral('@celi/shared')),
      jsApiFunctionNode,
      exportDefaultDeclaration(identifier(name)),
    ].flat()
  )

  return { tsProgram, jsProgram }
}

function generateCode(program: Program) {
  return generate(program).code.replace(/\n\n/g, '\n').replace(/;/g, '')
}

export function createCodeParser(swaggerJSON: Swagger) {
  return (path: string, method: string) => {
    const { tsProgram, jsProgram } = resolveProgram(
      swaggerJSON.paths,
      path,
      method,
      swaggerJSON.definitions,
      swaggerJSON.basePath
    )

    return {
      tsCode: generateCode(tsProgram),
      jsCode: generateCode(jsProgram),
    }
  }
}
