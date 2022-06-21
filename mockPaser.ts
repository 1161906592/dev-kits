import { Definition, DefinitionArrayItem, JavaType, Paths, Properties, Swagger } from "./types"

type MockTemplate = Record<string, any>

function toMockTemplateKeyword(javaType: JavaType, item?: DefinitionArrayItem): any {
  if (javaType === "string") {
    return "@string()"
  }

  if (["number", "integer"].includes(javaType)) {
    return "@integer()"
  }

  if (javaType === "boolean") {
    return "@boolean()"
  }

  if (javaType === "object") {
    return {}
  }

  if (javaType === "array") {
    const mockKeyword = item?.$ref ? item.$ref : item?.type ? toMockTemplateKeyword(item?.type) : null

    if (mockKeyword) {
      return [mockKeyword]
    }
  }
}

function toMockTemplate(properties: Properties) {
  const result: MockTemplate = {}

  Object.keys(properties).forEach((propName) => {
    const { type, $ref, items, enum: enums } = properties[propName]

    if (enums) {
      result[propName] = enums[~~(Math.random() * enums.length)]
    }

    const mockTemplate = $ref ? $ref : type ? toMockTemplateKeyword(type, items) : null
    if (!mockTemplate) return
    result[propName] = mockTemplate
  })

  return result
}

function toMockTemplateMap(definitions: Record<string, Definition>) {
  const map: Record<string, any> = {}

  Object.keys(definitions).forEach((key) => {
    map[key] = toMockTemplate(definitions[key].properties)
  })

  return map
}

function resolveMockTemplate($ref: string, map: Record<string, MockTemplate>, collector: string[]) {
  const refName = $ref.substring("#/definitions/".length)
  const mockTemplate = map[refName]
  if (!mockTemplate || collector.some((d) => d === refName)) return {}

  collector.push(refName)

  Object.keys(mockTemplate).forEach((key) => {
    const value = mockTemplate[key]

    if (Array.isArray(value) && `${value[0]}`.startsWith("#/definitions/")) {
      mockTemplate[key] = [resolveMockTemplate(value[0], map, collector)]
    } else if (`${value}`.startsWith("#/definitions/")) {
      mockTemplate[key] = resolveMockTemplate(value, map, collector)
    }
  })

  return mockTemplate
}

function resolveProgram(paths: Paths, path: string, method: string, map: Record<string, MockTemplate>) {
  const $ref = paths[path][method].responses[200].schema?.$ref

  if (!$ref) return
  const collector: string[] = []

  return resolveMockTemplate($ref, map, collector)
}

export function createMockParser(swaggerJSON: Swagger) {
  const map = toMockTemplateMap(swaggerJSON.definitions as unknown as Record<string, Definition>)

  return (path: string, method: string) => {
    const mockTemplate = resolveProgram(swaggerJSON.paths, path, method, map)

    return mockTemplate
  }
}
