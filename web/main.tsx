import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import { readApiKey } from './platform/modules/secrets.js'
import { useSettings } from './services/settings.js'
import { initPlatform } from './platform/index.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()

const root = createRoot(document.getElementById('root') as HTMLElement)

// 先装配平台槽位（探测原生外壳、预载钥匙串），再渲染，避免首帧读到空 API Key
void initPlatform()
  .catch(() => [])
  .then(() => {
    // 原生密钥在 initPlatform 里 hydrate 完成，这里回写进设置，
    // 否则 store 会一直是模块求值时的旧值（原生实现下表现为每次都要重新输入 Key）
    useSettings.setState({ apiKey: readApiKey() })
    root.render(<App />)
  })
