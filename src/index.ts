export interface Codegen {
  name: string
  transform(input: string): string
}

export interface IConfig {
  codegen?: Codegen[]
}

export function defineConfig(config: IConfig) {
  return config
}
