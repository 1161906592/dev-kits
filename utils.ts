// 匹配引用类型的名称
export function matchInterfaceName($ref?: string) {
  return $ref?.match(/#\/definitions\/(\w+).*/)?.[1] || ''
}
