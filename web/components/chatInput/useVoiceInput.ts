import { useCallback, useEffect, useRef, useState } from 'react'
import type { TranslationMessage } from '../../i18n/index.js'
import { platform } from '../../platform/index.js'
import { startRecording, type Recording } from '../../services/speech/recorder.js'
import { useSettings } from '../../services/settings.js'
import { showToast } from '../base/toastState.js'

export type VoiceInputStatus = 'idle' | 'recording' | 'transcribing'

/**
 * 录音依赖 getUserMedia：只在安全上下文可用（HTTPS、localhost、file://），
 * 并且要求运行环境暴露 mediaDevices——部分系统 WebView 没有这个对象。
 */
const AVAILABLE =
  typeof window === 'undefined' ||
  (window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function')

/** 入口不可用的原因，可用时为 null；按钮标签与点击提示共用 */
const UNAVAILABLE_REASON: TranslationMessage | null = AVAILABLE
  ? null
  : typeof window !== 'undefined' && !window.isSecureContext
    ? { key: 'voiceInputRequiresHttps' }
    : { key: 'voiceInputUnsupported' }

const describeRecordingError = (error: unknown): TranslationMessage => {
  if (!(error instanceof DOMException)) {
    return { key: 'voiceInputFailed' }
  }
  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      // 原生外壳里没有“浏览器设置”可改，要引导到系统里的应用权限
      return {
        key:
          platform.target === 'tauri'
            ? 'voiceInputPermissionDeniedApp'
            : 'voiceInputPermissionDenied',
      }
    case 'SecurityError':
      return { key: 'voiceInputRequiresHttps' }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { key: 'voiceInputNoDevice' }
    // Android WebView 上麦克风被占用、或音频通路建不起来时是这两个名字
    case 'NotReadableError':
    case 'TrackStartError':
      return { key: 'voiceInputDeviceBusy' }
    default:
      return { key: 'voiceInputFailed' }
  }
}

/**
 * 语音输入（oneshot）：点击开始录音，再次点击结束并转写，结果交给 onText 填入输入框。
 * 转写中再次点击取消。录满 120 秒自动结束。
 */
export const useVoiceInput = (onText: (text: string) => void) => {
  const [status, setStatus] = useState<VoiceInputStatus>('idle')
  /** 本次录音已录秒数，只在录音中递增 */
  const [seconds, setSeconds] = useState(0)
  const recordingRef = useRef<Recording | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const operationRef = useRef(0)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const cancelOperation = useCallback(() => {
    operationRef.current++
    recordingRef.current?.cancel()
    recordingRef.current = null
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  const cancel = useCallback(() => {
    cancelOperation()
    setStatus('idle')
  }, [cancelOperation])

  const finish = useCallback(async () => {
    const recording = recordingRef.current
    if (!recording) {
      // 仍在等待麦克风授权时也允许取消；迟到的录音对象会立即释放。
      cancel()
      return
    }
    const operation = operationRef.current
    recordingRef.current = null
    let controller: AbortController | null = null
    try {
      let audio: Blob | null
      try {
        audio = await recording.stop()
      } finally {
        recording.cancel()
      }
      if (operationRef.current !== operation) {
        return
      }
      if (!audio) {
        // 一帧都没采到：AudioContext 可能仍处于 suspended，或设备没有输出，别静默结束
        showToast({ key: 'voiceInputNothingCaptured' })
        return
      }
      controller = new AbortController()
      controllerRef.current = controller
      setStatus('transcribing')
      const text = await platform.http.transcribe(
        useSettings.getState().apiKey ?? '',
        audio,
        controller.signal
      )
      if (controller.signal.aborted || operationRef.current !== operation) {
        return
      }
      if (text.trim()) {
        onTextRef.current(text.trim())
      } else {
        showToast({ key: 'voiceInputEmpty' })
      }
    } catch {
      if (operationRef.current === operation && !controller?.signal.aborted) {
        showToast({ key: 'voiceInputFailed' })
      }
    } finally {
      if (operationRef.current === operation) {
        controllerRef.current = null
        setStatus('idle')
      }
    }
  }, [cancel])

  const toggle = useCallback(async () => {
    if (!AVAILABLE) {
      // 移动端没有 hover，tooltip 看不到，点击时直接说明原因
      showToast(UNAVAILABLE_REASON ?? { key: 'voiceInputUnsupported' })
      return
    }
    if (status === 'recording') {
      await finish()
      return
    }
    if (status === 'transcribing') {
      cancel()
      return
    }
    const operation = ++operationRef.current
    setStatus('recording')
    try {
      const recording = await startRecording(() => {
        if (operationRef.current === operation) {
          showToast({ key: 'voiceInputLimitReached' })
          void finish()
        }
      })
      if (operationRef.current !== operation) {
        recording.cancel()
        return
      }
      recordingRef.current = recording
    } catch (error) {
      if (operationRef.current === operation) {
        setStatus('idle')
        showToast(describeRecordingError(error))
      }
    }
  }, [status, finish, cancel])

  useEffect(() => {
    if (status !== 'recording') {
      return
    }
    const startedAt = Date.now()
    setSeconds(0)
    // 半秒刷新一次，让显示的秒数与实际录音时长保持一致
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 500)
    return () => clearInterval(timer)
  }, [status])

  useEffect(() => cancelOperation, [cancelOperation])

  /** 当前录音的频谱分析节点，未录音时为 null */
  const getAnalyser = useCallback(() => recordingRef.current?.analyser ?? null, [])

  return {
    status,
    seconds,
    getAnalyser,
    toggle,
    cancel,
    available: AVAILABLE,
    unavailableReason: UNAVAILABLE_REASON,
  }
}
