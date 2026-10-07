import { downscale } from './image'

/** On-device OCR. Tesseract is lazy-loaded so it is not part of the main bundle. */
export async function recognizeImage(file: File, onProgress?: (p: number) => void): Promise<string> {
  const image = await downscale(file, 1600, 0.9)
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    // Self-hosted (see scripts/vite-tesseract.ts) so the service worker can cache them for offline use.
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/',
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(image)
    return data.text
  } finally {
    await worker.terminate()
  }
}
