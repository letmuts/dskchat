import type { MouseEvent, ReactNode } from 'react'
import { platform } from '../../platform/index.js'

type Props = {
  /** 解析失败时可以为空，此时只显示文字、不产生可点击链接 */
  href?: string
  children: ReactNode
  className?: string
  title?: string
  'aria-label'?: string
}

/**
 * 外链：Web 保留 target=_blank 的原生行为（中键、快捷键都能用）；
 * 原生外壳里改为交给系统浏览器，避免在 WebView 内部新开窗口。
 */
export const ExternalLink = ({ href, children, className, title, ...rest }: Props) => {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!href || platform.system.origin === 'web') {
      return
    }
    event.preventDefault()
    platform.system.openExternal(href)
  }

  return (
    <a
      href={href}
      className={className}
      title={title}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      {...rest}
    >
      {children}
    </a>
  )
}
