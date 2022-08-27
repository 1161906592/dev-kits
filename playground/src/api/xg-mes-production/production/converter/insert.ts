import { request } from "@celi/shared"
export interface InsertQuery {
  actualSteelGrade?: string // 实际钢种
  argonAfterTemp?: number // 氩后温度
  argonBeforeTemp?: number // 氩前温度
  argonDur?: number // 吹氩时长
  argonEnd?: string // 吹氩结束时间
  argonStart?: string // 吹氩开始时间
  blowEnd?: string // 主吹结束时间
  blowO2Times?: number // 吹氧次数
  blowStart?: string // 主吹开始时间
  bofCode?: string // 炉座号
  createTime?: string // 创建时间
  fallConTimes?: number // 倒炉次数
  finTemp?: number // 出钢测温【炉后温度】
  firstTemp?: number // 倒炉测温【炉前温度】
  furanceAge?: number // 炉龄
  groupCode?: string // 班组编码
  heatCode: string // 炉次号
  holeAge?: number // 出钢口次数
  ironEnd?: string // 兑铁结束时间
  ironStart?: string // 兑铁开始时间
  ironWeight?: number // 铁水总重
  laddleCode?: string // 钢包号
  lanceAgeA?: number // 氧气枪龄A
  lanceAgeB?: number // 氧气枪龄B
  lanceUsing?: string // 氧气枪口
  o2Dur?: number // 供氧时长
  o2Pressure?: number // 供氧压力
  reblowDur?: number // 点吹时长
  reblowEnd?: string // 点吹结束时间
  reblowStart?: string // 点吹开始时间
  reblowTimes?: number // 点吹次数
  scarpEnd?: string // 废钢装载结束时间
  scarpStart?: string // 废钢装载开始时间
  scrapDirection?: string // 钢水去向
  scrapWeight?: number // 废钢总重
  shiftCode?: string // 班次编码
  smeltDur?: number // 冶炼时长
  steelWeight?: number // 出钢钢水重量
  tapDur?: number // 出钢时长
  tapEnd?: string // 出钢结束时间
  tapStart?: string // 出钢开始时间
  topN2Acc?: number // 氮气消耗量
  topO2Acc?: number // 氧气消耗量
  totalWeight?: number // 总量
}
export interface ResponseEntity {
  code?: number
  content?: number
  message?: string
  successFlag?: boolean
}
// 新增
async function insert(query: InsertQuery) {
  const res = await request({
    url: "/api/xg-mes-production/production/converter/insert",
    method: "post",
    params: query
  })
  return (res.data as ResponseEntity)
}
export default insert