import type { GeodeApi } from '@shared/ipc'

declare global {
  interface Window {
    geode: GeodeApi
  }
}

export {}
