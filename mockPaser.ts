import { Definition, JavaType, Swagger } from "./types"

type MockTemplate = Record<string, unknown>

function toMockTemplateKeyword(javaType: JavaType): unknown {
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
}

function resolveMockTemplate(ref = "", definitions: Record<string, Definition>, collectors: Record<string, boolean>) {
  if (!ref || collectors[ref]) return
  collectors[ref] = true
  const properties = definitions[ref.substring("#/definitions/".length)].properties
  if (!properties) return

  const result: MockTemplate = {}

  Object.keys(properties).forEach((propName) => {
    const { type, $ref, items, enum: enums } = properties[propName]

    result[propName] = enums
      ? enums[~~(Math.random() * enums.length)]
      : type === "array"
      ? [items?.type ? toMockTemplateKeyword(items.type) : resolveMockTemplate(items?.$ref, definitions, collectors)]
      : type
      ? toMockTemplateKeyword(type)
      : $ref
      ? resolveMockTemplate($ref, definitions, collectors)
      : undefined
  })

  return result
}

export function createMockParser(swaggerJSON: Swagger) {
  return (path: string, method: string) => {
    return resolveMockTemplate(swaggerJSON.paths[path][method].responses[200].schema?.$ref, swaggerJSON.definitions, {})
  }
}
