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
  patchPath: (path, data) => {
    const port = data.host.split(':')[1]

    const basePathMap = {
      9001: '/',
      9002: '/xg-mes-material',
      9003: '/xg-mes-plan',
      9004: '/xg-mes-production',
    }

    return `/api${basePathMap[port]}${data.basePath}/${path}`
  },
  proxy: {
    rewrite(path, address) {
      const { port } = new URL(address)

      const portRewriteMap = {
        9001: () => path.replace('/api', ''),
        9002: () => path.replace('/api/xg-mes-material', ''),
        9003: () => path.replace('/api/xg-mes-plan', ''),
        9004: () => path.replace('/api/xg-mes-production', ''),
      }

      return portRewriteMap[port]()
    },
    isPass: () => true,
  },
  address: [
    {
      label: '服务器',
      value: 'server',
      children: [
        { label: '生产', value: 'http://192.168.50.161:9001/xg-mes-production' },
        { label: '计划', value: 'http://192.168.50.161:9001/xg-mes-plan' },
      ],
    },
    {
      label: '本地',
      value: 'local',
      children: [
        { label: '生产', value: 'http://192.168.50.161:9004' },
        { label: '计划', value: 'http://192.168.50.161:9003' },
      ],
    },
  ],
  apiTemplate: fs.readFileSync(`${process.cwd()}/.swagger/apiTemplate.ejs`, 'utf8'),
  codegen: [
    {
      key: 'fragment',
      label: '代码片段',
      children: [
        {
          key: 'search',
          label: '数据查询',
          children: [
            {
              key: 'queryModelData',
              label: '表单 model',
              transform(input) {
                return {
                  template: fs.readFileSync(`${process.cwd()}/.swagger/queryModelData.ejs`, 'utf8'),
                  data: {
                    fields: parseInterface(input).fields,
                    isSingle: true,
                  },
                }
              },
            },
            {
              key: 'queryFormFields',
              label: '表单 renderFields',
              transform(input) {
                return {
                  template: fs.readFileSync(`${process.cwd()}/.swagger/queryFormFields.ejs`, 'utf8'),
                  data: {
                    fields: parseInterface(input).fields,
                  },
                }
              },
            },
            {
              key: 'columns',
              label: '表格 columns',
              transform(input) {
                return {
                  template: fs.readFileSync(`${process.cwd()}/.swagger/columns.ejs`, 'utf8'),
                  data: parseInterface(input),
                }
              },
            },
          ],
        },
        {
          key: 'submit',
          label: '表单提交',
          children: [
            {
              key: 'formRules',
              label: '表单 formRules',
              transform(input) {
                return {
                  template: fs.readFileSync(`${process.cwd()}/.swagger/formRules.ejs`, 'utf8'),
                  data: {
                    fields: parseInterface(input).fields.filter(({ required }) => required),
                  },
                }
              },
            },
            {
              key: 'formFields',
              label: '表单 renderFields',
              transform(input) {
                return {
                  template: fs.readFileSync(`${process.cwd()}/.swagger/formFields.ejs`, 'utf8'),
                  data: {
                    fields: parseInterface(input).fields,
                  },
                }
              },
            },
            {
              key: 'formConverter',
              label: '转换为表单类型',
              transform(input) {
                return {
                  template: fs.readFileSync(`${process.cwd()}/.swagger/converter.ejs`, 'utf8'),
                  data: {
                    fields: parseInterface(input).fields.filter(
                      (d) => (d.type !== 'string' || d.meta?.includes('date-time')) && !/^(id|.+Id)$/.test(d.key || '')
                    ),
                  },
                }
              },
            },
            {
              key: 'dataConverter',
              label: '转换为后端类型',
              transform(input) {
                return {
                  template: fs.readFileSync(`${process.cwd()}/.swagger/converter.ejs`, 'utf8'),
                  data: {
                    fields: parseInterface(input).fields.filter(
                      (d) => (d.type !== 'string' || d.meta?.includes('date-time')) && !/^(id|.+Id)$/.test(d.key || '')
                    ),
                    isForm: true,
                  },
                }
              },
            },
            {
              key: 'formModel',
              label: '表单TS类型',
              transform(input) {
                const { typeName, fields } = parseInterface(input)

                return {
                  template: fs.readFileSync(`${process.cwd()}/.swagger/formModel.ejs`, 'utf8'),
                  data: {
                    typeName,
                    fields: fields
                      .filter(
                        (d) =>
                          (d.type !== 'string' || d.meta?.includes('date-time')) && !/^(id|.+Id)$/.test(d.key || '')
                      )
                      .filter((d) => !/\d+-\S+/.test(d.meta || '') && !d.meta?.includes('remote')),
                  },
                }
              },
            },
          ],
        },
      ],
    },
    {
      key: 'complex',
      label: '复合组件',
      children: [
        {
          key: 'crud',
          label: '增删改查',
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

            const { typeName: outputType = 'OutputType', fields: outputFields } = parseInterface(
              input.split(/export default .*?\n+/)[1] || ''
            )

            return {
              template: fs.readFileSync(`${process.cwd()}/.swagger/crud.ejs`, 'utf8'),
              data: {
                name,
                queryType,
                queryFields,
                isPageSearch,
                rowType: rowType || 'RowData',
                columns: columns,
                outputType,
                outputFields,
                options,
              },
            }
          },
        },
        {
          key: 'modalForm',
          label: '弹窗表单',
          transform(input, options) {
            const name = input.match(/function\s(.*?)\(/)?.[1] || 'name'

            const { typeName: inputType = 'InputType', fields: inputFields } = parseInterface(
              input.split(/export default .*?\n+/)[1] || ''
            )

            const outputType = input.match(/function.*?\(.*?data:\s(\w+?)?\)/)?.[1]

            const outputFields = outputType
              ? parseInterface(input.match(new RegExp(`interface\\s${outputType}\\s\\{[\\w\\W]+?\\}`))?.[0] || '')
                  .fields
              : []

            return {
              template: fs.readFileSync(`${process.cwd()}/.swagger/modalForm.ejs`, 'utf8'),
              data: {
                name,
                inputType,
                inputFields,
                outputType,
                outputFields,
                options,
              },
            }
          },
        },
        {
          key: 'batch',
          label: '批量管理',
          transform(input, options) {
            const name = input.match(/function\s(.*?)\(/)?.[1] || 'name'

            const inputType = input.match(/content\?:\s(.+?)\[\]/)?.[1]

            const inputFields = inputType
              ? parseInterface(input.match(new RegExp(`interface\\s${inputType}\\s\\{[\\w\\W]+?\\}`))?.[0] || '').fields
              : []

            const { typeName: outputType = 'OutputType', fields: outputFields } = parseInterface(
              input.split(/export default .*?\n+/)[1] || ''
            )

            return {
              template: fs.readFileSync(`${process.cwd()}/.swagger/batch.ejs`, 'utf8'),
              data: {
                name,
                inputType,
                inputFields,
                outputType,
                outputFields,
                options,
              },
            }
          },
        },
      ],
    },
  ],
})
