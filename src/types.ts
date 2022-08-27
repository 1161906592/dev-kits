import { TSTypeAnnotation } from '@babel/types'

export type JavaBaseType = 'integer' | 'number' | 'string' | 'boolean'

export type JavaType = JavaBaseType | 'array' | 'object'

export interface DefinitionArrayItem {
  $ref?: string
  type?: JavaBaseType
}

export interface Definition {
  required: string[]
  properties: Properties
}

export type Properties = Record<string, Property>

export interface Property {
  type?: JavaType
  $ref?: string
  description?: string
  items?: DefinitionArrayItem
  format?: string
  enum?: (string | number)[]
}

export interface Parameter {
  name: string
  in: 'query' | 'body' | 'path'
  description: string
  required: boolean
  type: JavaBaseType
  format?: string
  allowEmptyValue?: boolean
  schema?: {
    $ref: string
    type?: JavaType
    items?: DefinitionArrayItem
  }
}

export interface RequestDefinition {
  tags: string[]
  produces?: string[]
  consumes?: string[]
  summary: string
  description: string
  operationId: string
  parameters?: Parameter[]
  tsCode?: string
  jsCode?: string
  mockTemplate?: string
  mockJSON?: string
  responses: Record<
    '200',
    {
      description: string
      schema?: {
        $ref: string
      }
    }
  >
}

export interface Paths {
  [key: string]: Record<string, RequestDefinition>
}

export interface Tag {
  name: string
  description?: string
}

export interface Swagger {
  basePath: string
  definitions: Record<string, Definition>
  host: string
  paths: Paths
  swagger: string
  tags: Tag[]
}

export interface ExportFunctionOptions {
  name: string
  pathInterface?: string
  queryInterface?: string
  bodyTsTypeAnnotation?: TSTypeAnnotation
}

export interface ParseResult {
  key: string
  type: string
  required: boolean
  title?: string
  meta?: string
}
