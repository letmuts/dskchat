/**
 * 给 `tauri android init` 生成的 AndroidManifest 补权限。
 *
 * `src-tauri/gen/` 被 .gitignore 忽略、CI 每次重建，所以权限不能手改，
 * 必须在这里脚本化，`pnpm tauri:android:init` 会自动执行。
 */
import fs from 'node:fs'
import path from 'node:path'

const MANIFEST = path.resolve('src-tauri/gen/android/app/src/main/AndroidManifest.xml')

/** 语音输入需要麦克风；联网权限模板默认已有，这里做幂等补齐 */
const PERMISSIONS = ['android.permission.INTERNET', 'android.permission.RECORD_AUDIO']

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

const lines = missing.map((permission) => `    <uses-permission android:name="${permission}" />`).join('\n')
const anchor = /^(\s*)<application\b/m
if (!anchor.test(xml)) {
  console.error('[android] AndroidManifest.xml 结构不符合预期，未找到 <application>')
  process.exit(1)
}

xml = xml.replace(anchor, `${lines}\n\n$&`)
fs.writeFileSync(MANIFEST, xml)
console.log(`[android] 已补权限：${missing.join(', ')}`)
