import fs from 'fs'
import { defineConfig } from '@celi/swagger-codegen'

interface ParseResult {
  key: string
  required: boolean
  type: string
  title?: string
  meta?: string
}

export function parseInterface(input: string) {
  const matches = input.match(/.*?interface\s+(\w+)\s+{([\w\W]*)}/)

  return {
    typeName: matches?.[1] || '',
    fields: (
      (matches?.[2]
        .split(/\r?\n/)
        .map((d) => {
          const matches = d.match(/(\w+)(\?)?:\s*(\w+)\s*(?:\/\/\s*(\S*)\s*(.+)?)?/)

          if (!matches) {
            return null
          }

          return {
            key: matches[1],
            required: !matches[2],
            type: matches[3],
            title: matches[4]?.trim(),
            meta: matches[5]?.trim(),
          }
        })
        .filter((d) => d) || []) as ParseResult[]
    ).map(({ key, type, required, title, meta }) => ({
      key,
      type,
      required,
      title: title?.replace(/[a-zA-Z-()]/g, ''),
      meta,
    })),
  }
}

export default defineConfig({
  // patchPath: (path, data) => {
  //   const port = data.host.split(':')[1]

  //   const basePathMap = {
  //     9001: '/',
  //     9004: '/xg-mes-production',
  //   }

  //   return `/api${basePathMap[port]}/${path}`
  // },
  apiTemplate: `
  import { request } from "@celi/shared"
  
  <% interfaces.forEach(function(item){ %>
  export interface <%- item.name %> {
    <% item.props.forEach(function(prop){ %>
      <%- prop.name %><% if (!prop.required) { %>?<% } %>: <%- prop.type %><% if (prop.description || prop.format) { %>// <% } %><% if (prop.description) { %><%- prop.description %> <% } %><% if (prop.format) { %><%- prop.format %> <% } %>
    <% }); %>
  }
  <% }); %>
  
  <% if (comment) { %>// <%- comment %><% } %>
  async function <%- name %>(<%- args %>) {
    const res = await request({
      url: <%- path %>,
      method: <%- method %>,
      <% if(query) { %>
      params: query,
      <% } %>
      <% if(data) { %>
      data,
      <% } %>
    })
    return res.data<% if(responseBody) { %> as <%- responseBody %> <% } %>
  }
  export default <%- name %>`,
  codegen: {
    1: {
      name: '表格列',
      transform(input) {
        return {
          template: `
          const columns: DataTableColumns<<%- typeName %>> = [
            <% fields.forEach(function(prop){ %>
              { key: '<%- prop.key %>', title: '<%- prop.title %>' },
            <% }); %>
          ]`,
          data: parseInterface(input),
        }
      },
    },
    2: {
      name: '表单字段',
      transform(input) {
        const { fields } = parseInterface(input)

        return {
          template: `
          // 校验规则
          const rules: FormRules = {
            <% formRules.forEach(function(item){ %>
              <%- item.key %>: { required: true, trigger: 'input', message: '请<%- item.meta?.includes('date-time') ? '选择' : '输入' %><%- item.title %>' },
            <% }); %>
          }

          // 表单项
          const renderFormItems = () => (
            <>
              <% fields.forEach(function(item){ %>
                <NFormItem label="<%- item.title %>:" path="<%- item.key %>">
                  <<%- item.meta?.includes('date-time') ? 'NDatePicker' : 'NInput' %> v-model:value={modelRef.value.<%- item.key %>}></<%- item.meta?.includes('date-time') ? 'NDatePicker' : 'NInput' %>>
                </NFormItem>
              <% }); %>
            </>
          )`,
          data: {
            rules: fields.filter(({ required }) => required),
            fields: fields,
          },
        }
      },
    },
    3: {
      name: '表单转换',
      transform(input) {
        return {
          template: `
          modelRef.value = pickConvert(props.data, {
            <% fields.forEach(function(item){ %>
              <%- item.key %>: pickConvert.preset.<%- item.meta?.includes('date-time') ? 'toTimeStamp' : 'toString' %>,
            <% }); %>
          }, null)`,
          data: {
            fields: parseInterface(input).fields.filter(
              (d) => (d.type !== 'string' || d.meta?.includes('date-time')) && !/^(id|.+Id)$/.test(d.key || '')
            ),
          },
        }
      },
    },
    4: {
      name: '数据转换',
      transform(input) {
        return {
          template: `
          const converter = {
            <% fields.forEach(function(item){ %>
              <%- item.key %>: pickConvert.preset.<%- item.meta?.includes('date-time') ? 'toTimeString' : 'toNumber' %>,
            <% }); %>
          }`,
          data: {
            fields: parseInterface(input).fields.filter(
              (d) => (d.type !== 'string' || d.meta?.includes('date-time')) && !/^(id|.+Id)$/.test(d.key || '')
            ),
          },
        }
      },
    },
    5: {
      name: '增删改查',
      options: [
        { label: '新增', value: 'add' },
        { label: '修改', value: 'update' },
        { label: '删除', value: 'delete' },
      ],
      transform(input, options) {
        const name = input.match(/function (.*?)\(/)?.[1] || 'name'
        const isPageSearch = input.includes('PageBeanEntity')

        const queryType = input.match(/query\?:\s(.+?)\s/)?.[1]

        const queryFields = queryType
          ? parseInterface(input.match(new RegExp(`interface\\s${queryType}\\s\\{[\\w\\W]+?\\}`))?.[0] || '').fields
          : []

        const rowType = isPageSearch
          ? input.match(/records\?:\s(.+?)\[\]/)?.[1]
          : input.match(/content\?:\s(.+?)\[\]/)?.[1]

        const columns = rowType
          ? parseInterface(input.match(new RegExp(`interface\\s${rowType}\\s\\{[\\w\\W]+?\\}`))?.[0] || '').fields
          : []

        return {
          template:
            fs.readFileSync(`${process.cwd()}/.swagger/crud.ejs`, 'utf8').match(/<script>([\w\W]*)<\/script>/)?.[1] ||
            '',
          data: {
            name,
            queryType,
            queryFields,
            isPageSearch,
            rowType: rowType || 'RowData',
            columns: columns,
            formModelFields: columns.filter(
              (d) => (d.type !== 'string' || d.meta?.includes('date-time')) && !/^(id|.+Id)$/.test(d.key || '')
            ),
            formFields: columns.filter((d) => d.key !== 'id'),
            options,
          },
        }
      },
    },
    6: {
      name: '弹窗表单',
      transform(input, options) {
        const name = input.match(/function (.*?)\(/)?.[1] || 'name'

        const { typeName, fields } = parseInterface(input.split(/export default .*?\n+/)[1] || '')

        return {
          template:
            fs
              .readFileSync(`${process.cwd()}/.swagger/modalForm.ejs`, 'utf8')
              .match(/<script>([\w\W]*)<\/script>/)?.[1] || '',
          data: {
            name,
            rowType: typeName || 'RowData',
            columns: fields,
            formModelFields: fields.filter(
              (d) => (d.type !== 'string' || d.meta?.includes('date-time')) && !/^(id|.+Id)$/.test(d.key || '')
            ),
            formFields: fields.filter((d) => d.key !== 'id'),
            formRuleFields: fields.filter((d) => d.key !== 'id' && d.required),
            options,
          },
        }
      },
    },
  },
})
