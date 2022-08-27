import { defineConfig, parseInterface } from '@celi/swagger-codegen'

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
      <%- prop.name %><% if (prop.required) { %>?<% } %>: <%- prop.type %><% if (prop.description || prop.format) { %>// <% } %><% if (prop.description) { %><%- prop.description %> <% } %><% if (prop.format) { %><%- prop.format %> <% } %>
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
          const columns: DataTableColumns<<%- type %>> = [
            <% props.forEach(function(prop){ %>
              { key: '<%- prop.key %>', title: '<%- prop.title %>' },
            <% }); %>
          ]`,
          data: {
            type: input.match(/.*?interface\s+(\w+)\s+{([\w\W]*)}/)?.[1],
            props: parseInterface(input),
          },
        }
      },
    },
    2: {
      name: '表单字段',
      transform(input) {
        const parseResult = parseInterface(input)

        return {
          template: `
          // 校验规则
          const rules: FormRules = {
            <% rules.forEach(function(item){ %>
              <%- item.key %>: { required: true, trigger: 'input', message: '请<%- item.type %><%- item.title %>' },
            <% }); %>
          }

          // 表单项
          const renderFormItems = () => (
            <>
              <% fields.forEach(function(item){ %>
                <NFormItem label="<%- item.title %>:" path="<%- item.key %>">
                  <<%- item.component %> v-model:value={modelRef.value.<%- item.key %>}></<%- item.component %>>
                </NFormItem>
              <% }); %>
            </>
          )`,
          data: {
            rules: parseResult
              .filter(({ required }) => required)
              .map(({ key, title, meta }) => ({
                key,
                title: title?.replace(/[a-zA-Z]/g, ''),
                type: meta?.includes('date-time') ? '选择' : '输入',
              })),
            fields: parseResult.map(({ key, title, meta }) => ({
              key,
              title: title?.replace(/[a-zA-Z]/g, ''),
              component: meta?.includes('date-time') ? 'NDatePicker' : 'NInput',
            })),
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
              <%- item.key %>: pickConvert.preset.<%- item.method %>,
            <% }); %>
          }, null)`,
          data: {
            fields: parseInterface(input)
              .filter((d) => (d.type !== 'string' || d.meta?.includes('date-time')) && !/^(id|.+Id)$/.test(d.key))
              .map(({ key, meta }) => ({
                key,
                method: meta?.includes('date-time') ? 'toTimeStamp' : 'toString',
              })),
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
              <%- item.key %>: pickConvert.preset.<%- item.method %>,
            <% }); %>
          }`,
          data: {
            fields: parseInterface(input)
              .filter((d) => (d.type !== 'string' || d.meta?.includes('date-time')) && !/^(id|.+Id)$/.test(d.key))
              .map(({ key, meta }) => ({
                key,
                method: meta?.includes('date-time') ? 'toTimeString' : 'toNumber',
              })),
          },
        }
      },
    },
  },
})
