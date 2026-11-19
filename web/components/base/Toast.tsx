import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { ExternalLink } from './ExternalLink.js'
import { IconToastError16 } from './icons.js'
import { useToast } from './toastState.js'
import styles from './Toast.module.css'

export const Toast = () => {
  const t = useTranslate()
  const { id, message } = useToast()
  if (!message) {
    return null
  }
  if (typeof message === 'string') {
    return (
      <div key={id} className={styles.toast} role="status">
        {message}
      </div>
    )
  }
  const error = message.type === 'error'
  return (
    <div key={id} className={clsx(styles.toast, error && styles.error)} role="status">
      {error ? (
        <span className={styles.icon}>
          <IconToastError16 />
        </span>
      ) : null}
      <span className={styles.content}>
        {t(message.key, message.params)}
        {message.link ? (
          <ExternalLink className={styles.link} href={message.link.href}>
            {t(message.link.key)}
          </ExternalLink>
        ) : null}
      </span>
    </div>
  )
}
