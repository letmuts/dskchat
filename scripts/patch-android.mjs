/**
 * 给 `tauri android init` 生成的 AndroidManifest 补权限。
 *
 * `src-tauri/gen/` 被 .gitignore 忽略、CI 每次重建，所以权限不能手改，
 * 必须在这里脚本化，`pnpm tauri:android:init` 会自动执行；已生成过 gen/ 时
 * 单独跑 `node scripts/patch-android.mjs` 也可以（幂等，只补缺失项）。
 */
import fs from 'node:fs'
import path from 'node:path'

const MANIFEST = path.resolve('src-tauri/gen/android/app/src/main/AndroidManifest.xml')

/**
 * 语音输入需要麦克风；联网权限模板默认已有，这里做幂等补齐。
 *
 * `MODIFY_AUDIO_SETTINGS` 不能省：wry 的 RustWebChromeClient 在 onPermissionRequest
 * 里把它与 RECORD_AUDIO 放进同一次运行时申请，并要求两者都为 granted 才向 WebView
 * grant。清单里漏声明时，系统对这条权限直接返回 DENIED 且不弹窗，于是用户授权麦克风
 * 之后 getUserMedia 仍然拿到 NotAllowedError——表现为“已授权但提示无法使用麦克风”。
 */
const PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
]

if (!fs.existsSync(MANIFEST)) {
  console.error(`[android] 找不到 ${MANIFEST}，请先运行 tauri android init`)
  process.exit(1)
}

let xml = fs.readFileSync(MANIFEST, 'utf8')
const missing = PERMISSIONS.filter((permission) => !xml.includes(`"${permission}"`))

if (missing.length === 0) {
  console.log('[android] 权限已存在，无需修改')
  process.exit(0)
}

// 插到 <manifest> 开标签之后：一行一条，避免与已有标签挤在同一行导致 XML 难读
const anchor = /<manifest\b[^>]*>/
if (!anchor.test(xml)) {
  console.error('[android] AndroidManifest.xml 结构不符合预期，未找到 <manifest>')
  process.exit(1)
}

const lines = missing.map((permission) => `    <uses-permission android:name="${permission}" />`).join('\n')
xml = xml.replace(anchor, (tag) => `${tag}\n${lines}`)

// 写完再断言一次，避免“静默没补上”让权限问题拖到真机上才暴露
const left = PERMISSIONS.filter((permission) => !xml.includes(`"${permission}"`))
if (left.length > 0) {
  console.error(`[android] 权限写入失败：${left.join(', ')}`)
  process.exit(1)
}

fs.writeFileSync(MANIFEST, xml)
console.log(`[android] 已补权限：${missing.join(', ')}`)
