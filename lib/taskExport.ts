import { readErrorMessage } from '@/lib/utils'

export async function downloadTaskResultExport(taskId: string, format: 'csv' | 'json' = 'csv') {
  const response = await fetch(`/api/tasks/${taskId}/export?format=${format}`)

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  const blob = await response.blob()
  const downloadUrl = URL.createObjectURL(blob)
  const filename = getDownloadFilename(response.headers.get('content-disposition'), taskId, format)
  const anchor = document.createElement('a')

  anchor.href = downloadUrl
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl)
  }, 0)

  return {
    filename,
    partial: response.headers.get('x-scrapify-export-partial') === 'true',
  }
}

function getDownloadFilename(contentDisposition: string | null, taskId: string, format: 'csv' | 'json') {
  if (contentDisposition) {
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1])
    }

    const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
    if (basicMatch?.[1]) {
      return basicMatch[1]
    }
  }

  return `scrapify-${taskId}.${format}`
}
