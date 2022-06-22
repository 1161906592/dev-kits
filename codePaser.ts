import generate from "@babel/generator"
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
  TSInterfaceBody,
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
} from "@babel/types"
import {
  Definition,
  DefinitionArrayItem,
  ExportFunctionOptions,
  JavaType,
  Parameter,
  Paths,
  Properties,
  RequestDefinition,
  Swagger,
} from "./types"
import { matchInterfaceName } from "./utils"

function makeTsPropertySignature(name: string, tsTypeAnnotation: TSTypeAnnotation) {
  return tsPropertySignature(name.includes("-") ? stringLiteral(name) : identifier(name), tsTypeAnnotation)
}

function toInterfaceBody(properties: Properties) {
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
      optional: true,
    }

    interfaceBody.push(description ? addComment(node, "trailing", ` ${description}`, true) : node)
  })

  return tsInterfaceBody(interfaceBody)
}

function javaTypeToTsKeyword(
  javaType: JavaType,
  item?: DefinitionArrayItem,
): TSStringKeyword | TSNumberKeyword | TSBooleanKeyword | TSArrayType | TSObjectKeyword | void {
  if (javaType === "string") {
    return tsStringKeyword()
  }

  if (["number", "integer"].includes(javaType)) {
    return tsNumberKeyword()
  }

  if (javaType === "boolean") {
    return tsBooleanKeyword()
  }

  if (javaType === "object") {
    return tsObjectKeyword()
  }

  if (javaType === "array") {
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

function toInterfaceBodyMap(definitions: Record<string, Definition>) {
  const map: Record<string, TSInterfaceBody> = {}

  Object.keys(definitions).forEach((key) => {
    map[key] = toInterfaceBody(definitions[key].properties)
  })

  return map
}

function resolveInterface($ref: string, map: Record<string, TSInterfaceBody>, collector: ExportNamedDeclaration[]) {
  const tSInterfaceBody = map[$ref.substring("#/definitions/".length)]
  if (!tSInterfaceBody) return
  if (collector.some((d) => (d.declaration as TSInterfaceDeclaration).body === tSInterfaceBody)) return

  const interfaceName = matchInterfaceName($ref)

  collector.unshift(
    exportNamedDeclaration(tsInterfaceDeclaration(identifier(interfaceName), null, null, tSInterfaceBody)),
  )

  tSInterfaceBody.body.forEach((item) => {
    const refIdentifier = (((item.typeAnnotation?.typeAnnotation as TSArrayType).elementType as TSTypeReference)
      ?.typeName || (item.typeAnnotation?.typeAnnotation as TSTypeReference)?.typeName) as Identifier

    if (refIdentifier?.name) {
      resolveInterface(refIdentifier.name, map, collector)
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
  resolveType: "query" | "path",
  map: Record<string, TSInterfaceBody>,
) {
  const collector: ExportNamedDeclaration[] = []

  const interfaceBody: Array<TSTypeElement> = []

  const interfaceName =
    toFirstUpperCase(name) + toFirstUpperCase(resolveType === "path" ? "pathVariables" : resolveType)

  parameters.forEach((parameter) => {
    const { name, description, required, type, schema } = parameter
    if (!((resolveType === "query" && !schema?.$ref) || parameter.in === resolveType)) return

    if (schema?.$ref) {
      resolveInterface(schema.$ref, map, collector)
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

    interfaceBody.push(description ? addComment(node, "trailing", ` ${description}`, true) : node)
  })

  if (!interfaceBody.length) {
    return []
  }

  collector.push(
    exportNamedDeclaration(
      tsInterfaceDeclaration(identifier(interfaceName), null, null, tsInterfaceBody(interfaceBody)),
    ),
  )

  return collector
}

function resolveResponseBodyInterface(definition: RequestDefinition, map: Record<string, TSInterfaceBody>) {
  const $ref = definition.responses[200].schema?.$ref

  const collector: ExportNamedDeclaration[] = []

  if ($ref) {
    resolveInterface($ref, map, collector)
  }

  return collector
}

function resolveRequestBodyInterface(definition: RequestDefinition, map: Record<string, TSInterfaceBody>) {
  const collector: ExportNamedDeclaration[] = []

  definition.parameters
    ?.filter((d) => d.in === "body" && d.schema?.$ref)
    .forEach((d) => resolveInterface(d.schema?.$ref as string, map, collector))

  return collector
}

function transformOperationId(operationId: string) {
  const index = operationId.indexOf("Using")

  return index === -1 ? operationId : operationId.slice(0, index)
}

function resolveQuery(definition: RequestDefinition, name: string, map: Record<string, TSInterfaceBody>) {
  return resolveQueryOrPath(definition.parameters || [], transformOperationId(definition.operationId), "query", map)
}

function resolvePath(definition: RequestDefinition, name: string, map: Record<string, TSInterfaceBody>) {
  return resolveQueryOrPath(definition.parameters || [], transformOperationId(definition.operationId), "path", map)
}

function resolveExportFunction(options: ExportFunctionOptions) {
  const { parameters, name, path, method, pathInterface, queryInterface, bodyInterface, responseBody } = options
  const pathVariableParameters = parameters.filter((d) => d.in === "path")

  // 处理路径参数的url
  const urlValueNode = pathVariableParameters.length
    ? templateLiteral(
        path
          .split(new RegExp(`{(?:${pathVariableParameters.map((d) => d.name).join("|")})}`))
          .map((d, i, arr) => templateElement({ raw: d, cooked: d }, i === arr.length - 1)),
        pathVariableParameters.map((d) => {
          const computed = d.name.includes("-")

          return memberExpression(
            identifier("pathVariables"),
            computed ? stringLiteral(d.name) : identifier(d.name),
            computed,
          )
        }),
      )
    : stringLiteral(path)

  const createBlockStatementNode = (isTs: boolean) =>
    blockStatement([
      variableDeclaration("const", [
        variableDeclarator(
          identifier("res"),
          awaitExpression(
            callExpression(identifier("request"), [
              objectExpression(
                [
                  objectProperty(identifier("url"), urlValueNode),
                  objectProperty(identifier("method"), stringLiteral(method)),
                  queryInterface && objectProperty(identifier("params"), identifier("query")),
                  bodyInterface && objectProperty(identifier("data"), identifier("data"), false, true),
                ].filter(Boolean) as ObjectProperty[],
              ),
            ]),
          ),
        ),
      ]),
      returnStatement(
        isTs && responseBody
          ? tsAsExpression(
              memberExpression(identifier("res"), identifier("data")),
              tsTypeReference(identifier(responseBody)),
            )
          : memberExpression(identifier("res"), identifier("data")),
      ),
    ])

  const tsApiFunctionNode = functionDeclaration(
    identifier(name),
    [
      pathInterface && {
        ...identifier("pathVariables"),
        typeAnnotation: tsTypeAnnotation(tsTypeReference(identifier(pathInterface))),
      },
      queryInterface && {
        ...identifier("query"),
        typeAnnotation: tsTypeAnnotation(tsTypeReference(identifier(queryInterface))),
      },
      bodyInterface && {
        ...identifier("data"),
        typeAnnotation: tsTypeAnnotation(tsTypeReference(identifier(bodyInterface))),
      },
    ].filter(Boolean) as Identifier[],
    createBlockStatementNode(true),
    false,
    true,
  )

  const jsApiFunctionNode = functionDeclaration(
    identifier(name),
    [
      pathInterface && identifier("pathVariables"),
      queryInterface && identifier("query"),
      bodyInterface && identifier("data"),
    ].filter(Boolean) as Identifier[],
    createBlockStatementNode(false),
    false,
    true,
  )

  return { tsApiFunctionNode, jsApiFunctionNode }
}

function resolveProgram(paths: Paths, path: string, method: string, map: Record<string, TSInterfaceBody>) {
  const definition = paths[path][method]
  const name = transformOperationId(definition.operationId)
  const pathExports = resolvePath(definition, name, map)
  const queryExports = resolveQuery(definition, name, map)
  const requestBodyExports = resolveRequestBodyInterface(definition, map)
  const responseBodyExports = resolveResponseBodyInterface(definition, map)
  const pathInterface = (pathExports[pathExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id.name
  const queryInterface = (queryExports[queryExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id.name

  const bodyInterface = (requestBodyExports[requestBodyExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id
    .name

  const responseBody = (responseBodyExports[responseBodyExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id
    .name

  const { tsApiFunctionNode, jsApiFunctionNode } = resolveExportFunction({
    parameters: definition.parameters || [],
    name,
    path,
    method,
    pathInterface,
    queryInterface,
    bodyInterface,
    responseBody,
  })

  // 函数注释
  const { summary, description } = definition

  if (summary || description) {
    addComment(tsApiFunctionNode, "leading", ` ${[summary, description].filter(Boolean).join(", ")}`, true)
    addComment(jsApiFunctionNode, "leading", ` ${[summary, description].filter(Boolean).join(", ")}`, true)
  }

  const tsProgram = program(
    [
      importDeclaration([importSpecifier(identifier("request"), identifier("request"))], stringLiteral("@celi/shared")),
      pathExports,
      queryExports,
      requestBodyExports,
      responseBodyExports,
      tsApiFunctionNode,
      exportDefaultDeclaration(identifier(name)),
    ].flat(),
  )

  const jsProgram = program(
    [
      importDeclaration([importSpecifier(identifier("request"), identifier("request"))], stringLiteral("@celi/shared")),
      jsApiFunctionNode,
      exportDefaultDeclaration(identifier(name)),
    ].flat(),
  )

  return { tsProgram, jsProgram }
}

function generateCode(program: Program) {
  return generate(program).code.replace(/\n\n/g, "\n").replace(/;/g, "")
}

export function createCodeParser(swaggerJSON: Swagger) {
  const map = toInterfaceBodyMap(swaggerJSON.definitions as unknown as Record<string, Definition>)

  return (path: string, method: string) => {
    const { tsProgram, jsProgram } = resolveProgram(swaggerJSON.paths, path, method, map)

    return {
      tsCode: generateCode(tsProgram),
      jsCode: generateCode(jsProgram),
    }
  }
}
