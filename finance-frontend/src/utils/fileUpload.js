export const HOSTED_UPLOAD_LIMIT = 1 * 1024 * 1024
export const HOSTED_UPLOAD_SAFE_MARGIN = 100 * 1024
export const HOSTED_PDF_MAX_BYTES = HOSTED_UPLOAD_LIMIT - HOSTED_UPLOAD_SAFE_MARGIN

const SKIP_COMPRESS_UNDER_BYTES = 700 * 1024
const MAX_DRAW_DIMENSION = 2400
const COMPRESS_TARGET_BYTES = 600 * 1024
const MIN_QUALITY = 0.45
const STEP_QUALITY = 0.1

export function isImageFile(file) {
  return /^image\/(jpeg|png|webp)$/i.test(file.type)
}

export function drawImageToCanvas(bitmap, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function encodeCanvas(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas encoding failed.'))),
      'image/jpeg',
      quality
    )
  })
}

async function encodeWithinBudget(canvas, maxBytes) {
  let quality = 0.9
  let blob = await encodeCanvas(canvas, quality)
  while (blob.size > maxBytes && quality > MIN_QUALITY) {
    quality = Number((quality - STEP_QUALITY).toFixed(2))
    blob = await encodeCanvas(canvas, quality)
  }
  return blob
}

export async function compressImageToUploadable(file) {
  if (!isImageFile(file) || file.size < SKIP_COMPRESS_UNDER_BYTES) return file

  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }

  let blob
  try {
    blob = await encodeWithinBudget(drawImageToCanvas(bitmap, MAX_DRAW_DIMENSION), COMPRESS_TARGET_BYTES)

    if (blob.size > HOSTED_PDF_MAX_BYTES) {
      blob = await encodeWithinBudget(drawImageToCanvas(bitmap, Math.round(MAX_DRAW_DIMENSION * 0.66)), COMPRESS_TARGET_BYTES)
    }
  } catch {
    blob = null
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close()
  }

  if (!blob) return file

  const baseName = (file.name || 'document').replace(/\.[^.]+$/, '') || 'document'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}