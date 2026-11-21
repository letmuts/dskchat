// 上传目标长边（像素）。模型侧会按视觉 token 网格归一化，2048 已经足够，同时能保住截图里的
// 小字；4096 只是服务端上限的兜底，不再当作上传尺寸。
const UPLOAD_IMAGE_EDGE = 2048
// JPEG / WebP 的压缩质量。0.85 与 1 肉眼几乎无差别，体积约为后者的一半到四分之一。
const UPLOAD_IMAGE_QUALITY = 0.85
// 只读文件头部判断尺寸：EXIF 与 SOF 都在前面，256 KiB 足够覆盖带大 ICC 的 JPEG。
const HEADER_BYTES = 256 * 1024

/** 服务端对单张图片的长边上限，超过会报 “width and height must each be at most 8192 pixels”。 */
export const SERVER_IMAGE_EDGE = 8192
/** 一次请求超过这么多张图片时，服务端的单边上限收紧到 4096。 */
export const MANY_IMAGE_COUNT = 15
export const SERVER_MANY_IMAGE_EDGE = 4096

type ImageSize = {
  /** 图片自身的像素宽度，未按 EXIF 方向旋转。 */
  width: number
  height: number
  /** EXIF Orientation；1 或缺省表示不需要额外旋转。 */
  orientation: number
}

const byteView = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const ascii = (bytes: Uint8Array, offset: number, length: number): string => {
  if (offset < 0 || offset + length > bytes.length) {
    return ''
  }
  let text = ''
  for (let index = 0; index < length; index++) {
    text += String.fromCharCode(bytes[offset + index])
  }
  return text
}

/** 读 EXIF 里的方向标签 0x0112；结构不认识时返回 null，由调用方按“正常方向”处理。 */
const exifOrientation = (bytes: Uint8Array, start: number): number | null => {
  if (start + 8 > bytes.length) {
    return null
  }
  const view = byteView(bytes)
  const little = bytes[start] === 0x49 && bytes[start + 1] === 0x49
  const big = bytes[start] === 0x4d && bytes[start + 1] === 0x4d
  if (!little && !big) {
    return null
  }
  const ifd = start + view.getUint32(start + 4, little)
  if (ifd + 2 > bytes.length) {
    return null
  }
  const count = view.getUint16(ifd, little)
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12
    if (entry + 12 > bytes.length) {
      return null
    }
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little)
      return value >= 2 && value <= 8 ? value : 1
    }
  }
  // 没有方向标签就是正常方向。
  return 1
}

/** 扫描 JPEG 段：先记下 EXIF 方向，再取第一个 SOF 里的宽高。 */
const jpegSize = (bytes: Uint8Array): ImageSize | null => {
  const view = byteView(bytes)
  let offset = 2
  let orientation = 1
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = bytes[offset + 1]
    // 填充字节与独立标记没有长度字段。
    if (marker === 0xff) {
      offset++
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    // 进入压缩数据仍没遇到 SOF，说明头部超过读取窗口。
    if (marker === 0xda || marker === 0xd9) {
      return null
    }
    const length = view.getUint16(offset + 2)
    if (length < 2) {
      return null
    }
    const segment = offset + 4
    if (marker === 0xe1 && ascii(bytes, segment, 6) === 'Exif\0\0') {
      orientation = exifOrientation(bytes, segment + 6) ?? 1
    }
    // SOF0–SOF15，跳过 DHT(0xc4)、JPG(0xc8)、DAC(0xcc)。
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (segment + 5 > bytes.length) {
        return null
      }
      const height = view.getUint16(segment + 1)
      const width = view.getUint16(segment + 3)
      return width > 0 && height > 0 ? { width, height, orientation } : null
    }
    offset += 2 + length
  }
  return null
}

/** WebP 有损（VP8）、无损（VP8L）与扩展（VP8X）三种头，宽高位置各不相同。 */
const webpSize = (bytes: Uint8Array): ImageSize | null => {
  const view = byteView(bytes)
  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16)) + 1
    const height = (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16)) + 1
    return { width, height, orientation: 1 }
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null
    }
    const width = view.getUint16(26, true) & 0x3fff
    const height = view.getUint16(28, true) & 0x3fff
    return width > 0 && height > 0 ? { width, height, orientation: 1 } : null
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const [b0, b1, b2, b3] = [bytes[21], bytes[22], bytes[23], bytes[24]]
    const width = 1 + (((b1 & 0x3f) << 8) | b0)
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    return { width, height, orientation: 1 }
  }
  return null
}

/** 从文件头解析宽高与方向；未识别的格式返回 null，由调用方退回解码。 */
const readImageHeader = async (blob: Blob): Promise<ImageSize | null> => {
  if (blob.size < 32) {
    return null
  }
  const bytes = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer())
  const view = byteView(bytes)
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return jpegSize(bytes)
  }
  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    if (ascii(bytes, 12, 4) !== 'IHDR' || bytes.length < 24) {
      return null
    }
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    return width > 0 && height > 0 ? { width, height, orientation: 1 } : null
  }
  const gif = ascii(bytes, 0, 6)
  if (gif === 'GIF87a' || gif === 'GIF89a') {
    if (bytes.length < 10) {
      return null
    }
    const width = view.getUint16(6, true)
    const height = view.getUint16(8, true)
    return width > 0 && height > 0 ? { width, height, orientation: 1 } : null
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return webpSize(bytes)
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d && bytes.length >= 26) {
    // 自下而上的 BMP 高度为负值。
    const width = Math.abs(view.getInt32(18, true))
    const height = Math.abs(view.getInt32(22, true))
    return width > 0 && height > 0 ? { width, height, orientation: 1 } : null
  }
  return null
}

/** 用 <img> 解码出尺寸；浏览器解不了时抛错。 */
const withImage = async <T>(
  blob: Blob,
  use: (image: HTMLImageElement) => Promise<T> | T
): Promise<T> => {
  const image = new Image()
  const url = URL.createObjectURL(blob)
  try {
    // 同时挂 onload，兼容没有 Image.decode() 的旧 Android WebView。
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Cannot decode image'))
    })
    image.src = url
    if (typeof image.decode === 'function') {
      await image.decode().catch(() => loaded)
    } else {
      await loaded
    }
    return await use(image)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const decodeImageSize = async (blob: Blob): Promise<ImageSize | null> =>
  withImage(blob, (image) =>
    image.naturalWidth > 0 && image.naturalHeight > 0
      ? // 解码得到的尺寸已经按 EXIF 方向旋转，标记为不需要再旋转。
        { width: image.naturalWidth, height: image.naturalHeight, orientation: 1 }
      : null
  ).catch(() => null)

/** 先读头部，失败再解码；两者都失败返回 null。 */
const readImageSize = async (blob: Blob): Promise<ImageSize | null> => {
  const header = await readImageHeader(blob).catch(() => null)
  return header ?? (await decodeImageSize(blob))
}

/** 32×32 采样判断是否含透明像素：大块透明能发现，1 像素级的透明边可能漏判。 */
const hasTransparency = async (image: HTMLImageElement): Promise<boolean> => {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 32
    const context = canvas.getContext('2d')
    if (!context) {
      return false
    }
    context.drawImage(image, 0, 0, 32, 32)
    const { data } = context.getImageData(0, 0, 32, 32)
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 255) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

/** 有透明通道时只能编码 PNG，否则透明区域会变黑。 */
const outputType = (sourceType: string, transparent: boolean): string => {
  if (transparent) {
    return 'image/png'
  }
  // 截图与动图保持无损，避免文字出现 JPEG 振铃。
  if (
    sourceType === 'image/png' ||
    sourceType === 'image/apng' ||
    sourceType === 'image/gif' ||
    sourceType === 'image/svg+xml'
  ) {
    return 'image/png'
  }
  if (sourceType === 'image/webp') {
    return 'image/webp'
  }
  return 'image/jpeg'
}

/** 按 EXIF 方向在画布坐标系里预置变换，drawImage 仍使用原始像素。 */
const applyOrientation = (
  context: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number
) => {
  switch (orientation) {
    case 2:
      context.transform(-1, 0, 0, 1, width, 0)
      break
    case 3:
      context.transform(-1, 0, 0, -1, width, height)
      break
    case 4:
      context.transform(1, 0, 0, -1, 0, height)
      break
    case 5:
      context.transform(0, 1, 1, 0, 0, 0)
      break
    case 6:
      context.transform(0, 1, -1, 0, width, 0)
      break
    case 7:
      context.transform(0, -1, -1, 0, width, height)
      break
    case 8:
      context.transform(0, -1, 1, 0, 0, height)
      break
    default:
      break
  }
}

const encodeCanvas = (canvas: HTMLCanvasElement, type: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Cannot encode image'))),
      type,
      UPLOAD_IMAGE_QUALITY
    )
  })

/**
 * 复用旧 file_id 前，用头部尺寸检查旧图是否超出服务端上限，避免再次触发
 * “width and height must each be at most ...” 报错。
 * 读不出尺寸时返回 undefined，调用方保留原 ID。
 *
 * 注意：上限是按“本次请求的图片张数”决定的，超过 {@link MANY_IMAGE_COUNT} 张时为 4096。
 * 若之后又追加图片把请求推过 15 张，先前按 8192 确认过的图片仍可能被服务端拒绝，
 * 这种情况由服务端报错并按普通请求错误展示。
 */
export const isUploadImageOversized = async (
  blob: Blob,
  limit: number = SERVER_IMAGE_EDGE
): Promise<boolean | undefined> => {
  const size = await readImageSize(blob)
  if (!size) {
    return undefined
  }
  return Math.max(size.width, size.height) > limit
}

/**
 * 图片上传前的压缩：长边超过 2048 时缩放并按 0.85 重新编码。
 * - 长边已在 2048 以内：直接返回原文件，完全不解码；
 * - 透明通道、截图与动图保留 PNG / WebP，照片转 JPEG；
 * - 编码结果不比原图小、且原图仍在服务端上限内时，仍然用原文件。
 */
export const resizeUploadImage = async (file: File, signal?: AbortSignal): Promise<File> => {
  signal?.throwIfAborted()
  const size = await readImageSize(file)
  signal?.throwIfAborted()
  // 读不到尺寸（头部与解码都不支持）时按原文件上传，交给服务端判断。
  if (!size) {
    return file
  }
  if (Math.max(size.width, size.height) <= UPLOAD_IMAGE_EDGE) {
    return file
  }

  return withImage(file, async (image) => {
    signal?.throwIfAborted()
    // 浏览器默认按 EXIF 方向解码（image-orientation: from-image，Chromium 81+），
    // 此时自然尺寸就是显示尺寸，不需要再手动旋转；老 WebView 不支持时由 applyOrientation 处理。
    // 另外用自然尺寸与头部原始尺寸是否一致兜底：正方形图片只看尺寸无法分辨，只能靠特性检测。
    const autoOrient = typeof CSS !== 'undefined' && CSS.supports('image-orientation', 'from-image')
    const browserRotated =
      autoOrient || image.naturalWidth !== size.width || image.naturalHeight !== size.height
    const swap = !browserRotated && size.orientation >= 5 && size.orientation <= 8
    // 缩放按“显示方向”的尺寸算：已旋转的用自然尺寸，否则按原始尺寸并按方向交换长短边。
    const orientedWidth = browserRotated ? image.naturalWidth : swap ? size.height : size.width
    const orientedHeight = browserRotated ? image.naturalHeight : swap ? size.width : size.height
    const scale = Math.min(1, UPLOAD_IMAGE_EDGE / Math.max(orientedWidth, orientedHeight))
    const width = Math.max(1, Math.round(orientedWidth * scale))
    const height = Math.max(1, Math.round(orientedHeight * scale))
    // 手动旋转时 drawImage 用的仍是原始像素尺寸；画布已按显示方向建好。
    const drawWidth = swap ? height : width
    const drawHeight = swap ? width : height
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    try {
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Cannot resize image')
      }
      if (!browserRotated && size.orientation !== 1) {
        applyOrientation(context, size.orientation, width, height)
      }
      context.drawImage(image, 0, 0, drawWidth, drawHeight)
      const type = outputType(file.type, await hasTransparency(image))
      const blob = await encodeCanvas(canvas, type)
      signal?.throwIfAborted()
      if (blob.size >= file.size && Math.max(size.width, size.height) <= SERVER_IMAGE_EDGE) {
        return file
      }
      // 浏览器可能回退到 PNG，上传文件的后缀以实际编码为准。
      const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.slice('image/'.length)
      const name = file.name.replace(/\.[^.]*$/, '') + '.' + extension
      return new File([blob], name, { type: blob.type, lastModified: file.lastModified })
    } finally {
      canvas.width = canvas.height = 0
    }
  })
}
