import { useState } from 'react'
import { recognizeImage } from '@/lib/ocr'

export function useOcr() {
  const [progress, setProgress] = useState<number | null>(null)
  return {
    busy: progress !== null,
    progress: progress ?? 0,
    async run(file: File) {
      setProgress(0)
      try {
        return await recognizeImage(file, setProgress)
      } finally {
        setProgress(null)
      }
    },
  }
}
