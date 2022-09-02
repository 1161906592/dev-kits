const Constant = {
  GUID: 1,
  RE_KEY: /(.+)\|(?:\+(\d+)|([+-]?\d+-?[+-]?\d*)?(?:\.(\d+-?\d*))?)/,
  RE_RANGE: /([+-]?\d+)-?([+-]?\d+)?/,
  RE_PLACEHOLDER: /\\*@([^@#%&()?\s]+)(?:\((.*?)\))?/g,
  // /\\*@([^@#%&()\?\s\/\.]+)(?:\((.*?)\))?/g
  // RE_INDEX: /^index$/,
  // RE_KEY: /^key$/
}

export function pathMock() {
  const { Random, Handler, Util } = require('mockjs')

  Handler.placeholder = function (placeholder: any, obj: any, templateContext: any, options: any) {
    // 1 key, 2 params
    Constant.RE_PLACEHOLDER.exec('')

    const parts: any = Constant.RE_PLACEHOLDER.exec(placeholder),
      key: any = parts && parts[1],
      lkey: any = key && key.toLowerCase(),
      okey: any = this._all()[lkey]

    let params: any = (parts && parts[2]) || ''

    const pathParts = this.splitPathToArray(key)

    // 解析占位符的参数
    try {
      // 1. 尝试保持参数的类型
      /*
            #24 [Window Firefox 30.0 引用 占位符 抛错](https://github.com/nuysoft/Mock/issues/24)
            [BX9056: 各浏览器下 window.eval 方法的执行上下文存在差异](http://www.w3help.org/zh-cn/causes/BX9056)
            应该属于 Window Firefox 30.0 的 BUG
        */
      /* jshint -W061 */
      params = eval(`(function(){ return [].splice.call(arguments, 0 ) })(${params})`)
    } catch (error) {
      // 2. 如果失败，只能解析为字符串
      // console.error(error)
      // if (error instanceof ReferenceError) params = parts[2].split(/,\s*/);
      // else throw error
      params = parts[2].split(/,\s*/)
    }

    // 占位符优先引用数据模板中的属性
    if (obj && key in obj && !/\(.+\)/.test(placeholder)) return obj[key]

    // @index @key
    // if (Constant.RE_INDEX.test(key)) return +options.name
    // if (Constant.RE_KEY.test(key)) return options.name

    // 绝对路径 or 相对路径
    if (key.charAt(0) === '/' || pathParts.length > 1) return this.getValueByKeyPath(key, options)

    // 递归引用数据模板中的属性

    if (
      templateContext &&
      typeof templateContext === 'object' &&
      key in templateContext &&
      !templateContext[key].includes(placeholder) && // fix #15 避免自己依赖自己
      !/\(.+\)/.test(placeholder)
    ) {
      // 先计算被引用的属性值
      templateContext[key] = Handler.gen(templateContext[key], key, {
        currentContext: obj,
        templateCurrentContext: templateContext,
      })

      return templateContext[key]
    }

    // 如果未找到，则原样返回
    if (!(key in Random) && !(lkey in Random) && !(okey in Random)) return placeholder

    // 递归解析参数中的占位符
    for (let i = 0; i < params.length; i += 1) {
      Constant.RE_PLACEHOLDER.exec('')

      if (Constant.RE_PLACEHOLDER.test(params[i])) {
        params[i] = Handler.placeholder(params[i], obj, templateContext, options)
      }
    }

    const handle = Random[key] || Random[lkey] || Random[okey]
    let re

    switch (Util.type(handle)) {
      case 'array':
        // 自动从数组中取一个，例如 @areas
        return Random.pick(handle)
      case 'function':
        // 执行占位符方法（大多数情况）
        handle.options = options
        re = handle.apply(Random, params)
        if (re === undefined) re = '' // 因为是在字符串中，所以默认为空字符串。
        delete handle.options

        return re
    }
  }
}
