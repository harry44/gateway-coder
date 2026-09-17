/// <reference types="vite/client" />
import type { GatewayApi } from '../../preload'

declare global {
  interface Window {
    api: GatewayApi
  }
}

export {}
