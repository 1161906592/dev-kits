import * as fs from 'fs-extra'
import { IConfig } from '..'
import { defaultConfigFile } from '../constants'

export let config = loadConfig()

export function updateConfig() {
  config = loadConfig()
}

async function loadConfig() {
  const resolvedPath = `${process.cwd()}/${defaultConfigFile}`
  if (!fs.existsSync(resolvedPath)) return
  const bundled = await bundleConfigFile(resolvedPath)

  if (!bundled) return

  const fileNameTmp = `${resolvedPath}.timestamp-${Date.now()}.js`
  fs.writeFileSync(fileNameTmp, bundled)

  try {
    delete require.cache[require.resolve(fileNameTmp)]

    return require(fileNameTmp).default as IConfig
  } finally {
    try {
      fs.unlinkSync(fileNameTmp)
    } catch {
      //
    }
  }
}

async function bundleConfigFile(fileName: string) {
  try {
    const result = await require('esbuild').build({
      absWorkingDir: process.cwd(),
      entryPoints: [fileName],
      outfile: 'out.js',
      write: false,
      target: ['node14.18', 'node16'],
      platform: 'node',
      bundle: true,
      format: 'cjs',
      sourcemap: false,
    })

    return result.outputFiles[0].text
  } catch {
    //
  }
}
