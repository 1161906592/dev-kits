import { promises } from 'fs'
import { dataDir } from '../constants'

export async function saveMockCode(path: string, method: string, type: string, code: string) {
  if (!code) return
  const filename = `${path}-${method}-${type}`.slice(1).replace(/[/?<>:"*|]/g, '+')
  await promises.writeFile(`${dataDir}/${filename}.txt`, code, 'utf8')
}

export async function removeMockCode(path: string, method: string, type: string) {
  const filename = `${path}-${method}-${type}`.slice(1).replace(/[/?<>:"*|]/g, '+')

  try {
    await promises.unlink(`${dataDir}/${filename}.txt`)
  } catch {
    //
  }
}

export async function loadMockCode(path: string, method: string, type: string) {
  const filename = `${path}-${method}-${type}`.slice(1).replace(/[/?<>:"*|]/g, '+')

  try {
    return await promises.readFile(`${dataDir}/${filename}.txt`, 'utf8')
  } catch {
    return ''
  }
}

// 保存websocket推送配置记录
export async function saveWSRecords(records: string[]) {
  const filename = 'websocket-records'

  try {
    await promises.writeFile(`${dataDir}/${filename}.txt`, records.join('\n'), 'utf8')
  } catch {
    //
  }
}

// 加载websocket推送配置记录
export async function loadWSRecords(): Promise<string[]> {
  const filename = 'websocket-records'

  try {
    return (await promises.readFile(`${dataDir}/${filename}.txt`, 'utf8')).split('\n').filter((d) => d.trim())
  } catch {
    return []
  }
}
