import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@rspack/cli'
import { rspack, type Configuration } from '@rspack/core'

const dev = process.env.NODE_ENV !== 'production'
const targets = ['chrome >= 105', 'edge >= 105', 'safari >= 16', 'firefox >= 110']
const root = path.dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string }

const cssLoader = {
  loader: 'builtin:lightningcss-loader',
  options: { targets },
}

/**
 * 打包目标：
 * - web：默认，产物可以直接双击 index.html 打开，也可以部署到静态站点；
 * - tauri：供原生外壳加载，额外启用 `@tauri-apps/api` 的按需 chunk。
 */
export type AppTarget = 'web' | 'tauri'

const readTarget = (): AppTarget => (process.env.APP_TARGET === 'tauri' ? 'tauri' : 'web')

/** 解析逗号分隔的原生模块列表，构建期默认值，运行时仍可覆盖 */
const readNativeModules = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

type ConfigOptions = {
  /** 公开 API 的地址，注入为 __API_ORIGIN__ */
  apiOrigin?: string
  /** 打包目标，注入为 __APP_TARGET__ */
  target?: AppTarget
  /** 构建期默认启用的原生模块，注入为 __NATIVE_MODULES__ */
  nativeModules?: string[]
  /** 开发服务器配置，支持本地接口代理 */
  devServer?: Configuration['devServer']
}

/** 创建构建配置，支持自定义 API 地址、打包目标与原生模块开关 */
export const createConfig = ({
  apiOrigin = 'https://api.deepseek.com',
  target = readTarget(),
  nativeModules = readNativeModules(process.env.NATIVE_MODULES),
  devServer,
}: ConfigOptions = {}): Configuration => ({
  mode: dev ? 'development' : 'production',
  entry: './web/main.tsx',
  output: {
    path: path.resolve(root, 'dist'),
    // 运行时按当前脚本地址推导资源路径，file:// 与 tauri:// 下异步 chunk、字体都按相对位置加载
    publicPath: 'auto',
    filename: 'static/js/[name].[contenthash:8].js',
    chunkFilename: 'static/js/async/[name].[contenthash:8].js',
    cssFilename: 'static/css/[name].[contenthash:8].css',
    cssChunkFilename: 'static/css/async/[name].[contenthash:8].css',
    assetModuleFilename: 'static/media/[name].[contenthash:8][ext]',
    clean: true,
  },
  devtool: dev ? 'cheap-module-source-map' : false,
  // 开发模式预编译异步模块，保持首次加载代码高亮和公式时的页面状态
  lazyCompilation: false,
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    // 将 .js 导入路径解析到同名 .ts、.tsx 或 .js 文件
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
    alias: {
      // 构建期替换原生桥接：web 构建不包含任何 @tauri-apps 代码
      '@native/bridge': path.resolve(
        root,
        target === 'tauri'
          ? 'web/platform/native/bridge.tauri.ts'
          : 'web/platform/native/bridge.web.ts'
      ),
    },
  },
  module: {
    // CSS Modules 使用默认导出：`import styles from './x.module.css'`
    parser: { 'css/module': { namedExports: false } },
    generator: { 'css/module': { localIdentName: '[local]-[hash:6]' } },
    rules: [
      { test: /\.module\.css$/, type: 'css/module', use: [cssLoader] },
      { test: /\.css$/, exclude: /\.module\.css$/, type: 'css', use: [cssLoader] },
      {
        test: /\.(j|t)sx?$/,
        exclude: /[\\/]node_modules[\\/]/,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: { syntax: 'typescript', tsx: true },
            transform: { react: { runtime: 'automatic', development: dev } },
            externalHelpers: true,
          },
          env: { targets },
        },
        type: 'javascript/auto',
      },
      { test: /\.(woff2?|ttf)$/, type: 'asset/resource' },
    ],
  },
  plugins: [
    // 经典 defer 脚本支持 file:// 与 tauri:// 页面的资源加载
    new rspack.HtmlRspackPlugin({
      template: './web/index.html',
      scriptLoading: 'defer',
      meta: { 'application-version': version, 'application-target': target },
    }),
    new rspack.DefinePlugin({
      __API_ORIGIN__: JSON.stringify(apiOrigin),
      __APP_TARGET__: JSON.stringify(target),
      // tauri 构建默认启用 system（外链交给系统浏览器）；Web 构建默认全部走 TS 实现
      __NATIVE_MODULES__: JSON.stringify(
        nativeModules.length > 0 ? nativeModules : target === 'tauri' ? ['system'] : []
      ),
    }),
    new rspack.CopyRspackPlugin({
      patterns: [{ from: path.resolve(root, 'LICENSE'), to: 'LICENSE', toType: 'file' }],
    }),
  ],
  performance: { hints: false },
  devServer: { port: 8090, ...devServer },
})

// eslint-disable-next-line import/no-default-export
export default defineConfig(createConfig())
