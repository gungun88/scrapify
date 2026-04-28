'use client'

import { useMemo } from 'react'

export function usePolling(enabled: boolean, interval = 3000) {
  return useMemo(() => (enabled ? interval : false), [enabled, interval])
}
