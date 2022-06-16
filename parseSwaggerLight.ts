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
import swaggerJSON from "./swagger.json"

type JavaBaseType = "integer" | "number" | "string" | "boolean"
type JavaType = JavaBaseType | "array" | "object"

interface DefinitionArrayItem {
  $ref?: string
  type?: JavaBaseType
}

interface Definition {
  required: string[]
  properties: Properties
}

type Properties = Record<
  string,
  {
    type?: JavaType
    $ref?: string
    description?: string
    items?: DefinitionArrayItem
    format?: string
    enum?: (string | number)[]
  }
>

interface Parameter {
  name: string
  in: "query" | "body" | "path"
  description: string
  required: boolean
  type: string
  format?: string
  allowEmptyValue?: boolean
  schema?: {
    $ref: string
    type?: string
  }
}

interface RequestDefinition {
  tags: string[]
  produces?: string[]
  consumes?: string[]
  summary: string
  description: string
  operationId: string
  parameters?: Parameter[]
  responses: Record<
    "200",
    {
      description: string
      schema: {
        $ref: string
      }
    }
  >
}

export interface TableRowVO {
  id: number
  name: string
  type?: string
  format?: string
  required?: boolean
  enum?: (string | number)[]
  description?: string
  children?: TableRowVO[]
}

interface ParsedRequestDefinition {
  tsCode: string
}

interface Paths {
  [key: string]: Record<string, RequestDefinition>
}

export interface ParsedSwagger {
  [key: string]: Record<string, ParsedRequestDefinition>
}

interface Tag {
  name: string
  description?: string
}

export interface Swagger {
  tags: Tag[]
  paths: Paths
  definitions: Record<string, Definition>
}

// 匹配引用类型的名称
function matchInterfaceName($ref?: string) {
  return $ref?.match(/#\/definitions\/(\w+).*/)?.[1] || ""
}

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
  if (collector.some((d) => (d.declaration as TSInterfaceDeclaration).body === tSInterfaceBody)) return

  const interfaceName = matchInterfaceName($ref)
  !tSInterfaceBody && console.log(111, tSInterfaceBody, $ref)

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
  const collector: ExportNamedDeclaration[] = []

  resolveInterface(definition.responses[200].schema.$ref, map, collector)

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

interface ExportFunctionOptions {
  parameters: Parameter[]
  name: string
  path: string
  method: string
  pathInterface?: string
  queryInterface?: string
  bodyInterface?: string
  responseBody?: string
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

  const tsApiFunction = functionDeclaration(
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
        responseBody
          ? tsAsExpression(
              memberExpression(identifier("res"), identifier("data")),
              tsTypeReference(identifier(responseBody)),
            )
          : memberExpression(identifier("res"), identifier("data")),
      ),
    ]),
    false,
    true,
  )

  return [tsApiFunction, exportDefaultDeclaration(identifier(name))]
}

function resolveProgram(paths: Paths, path: string, method: string, map: Record<string, TSInterfaceBody>) {
  const definition = paths[path][method]
  const name = transformOperationId(definition.operationId)
  const pathExports = resolvePath(definition, name, map)
  const queryExports = resolveQuery(definition, name, map)
  const requestBodyExports = resolveRequestBodyInterface(definition, map)
  const responseBodyExports = resolveResponseBodyInterface(definition, map)

  return program(
    [
      importDeclaration([importSpecifier(identifier("request"), identifier("request"))], stringLiteral("@celi/shared")),
      pathExports,
      queryExports,
      requestBodyExports,
      responseBodyExports,
      resolveExportFunction({
        parameters: definition.parameters || [],
        name,
        path,
        method,
        pathInterface: (pathExports[pathExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id.name,
        queryInterface: (queryExports[queryExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id.name,
        bodyInterface: (requestBodyExports[requestBodyExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id
          .name,
        responseBody: (responseBodyExports[responseBodyExports.length - 1]?.declaration as TSInterfaceDeclaration)?.id
          .name,
      }),
    ].flat(),
  )
}

function generateCode(program: Program) {
  return generate(program).code.replace(/\n\n/g, "\n").replace(/;/g, "")
}

const map = toInterfaceBodyMap(swaggerJSON.definitions as unknown as Record<string, Definition>)

console.log(
  generateCode(resolveProgram(swaggerJSON.paths as unknown as Paths, "/api/algorithm/burden/pageVersion", "post", map)),
)
