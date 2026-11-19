declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css' {}

/** 公开 API 的地址，见 rspack.config.ts 的 createConfig */
declare const __API_ORIGIN__: string

/** 打包目标：web（默认，可直接打开）或 tauri（原生外壳加载） */
declare const __APP_TARGET__: 'web' | 'tauri'

/** 构建期默认启用的原生模块 id，运行时可用 ?native= 或 localStorage 覆盖 */
declare const __NATIVE_MODULES__: readonly string[]

/** Prism 语言包通过副作用注册到全局 Prism */
declare module 'prismjs/components/*' {}

/** KaTeX 化学公式扩展通过副作用注册到 KaTeX */
declare module 'katex/contrib/mhchem' {}
