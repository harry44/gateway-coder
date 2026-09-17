import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

interface BrowserPanelProps {
  isOpen: boolean
  onClose: () => void
  initialUrl?: string
}

export default function BrowserPanel({ isOpen, onClose, initialUrl = 'https://www.google.com' }: BrowserPanelProps): JSX.Element | null {
  const webviewRef = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState(initialUrl)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('Loading...')

  const navigate = (newUrl: string): void => {
    if (!newUrl.trim()) return
    let finalUrl = newUrl
    if (!finalUrl.match(/^https?:\/\//)) {
      finalUrl = 'https://' + finalUrl
    }
    setUrl(finalUrl)
    const iframe = webviewRef.current?.querySelector('iframe') as HTMLIFrameElement
    if (iframe) {
      setLoading(true)
      iframe.src = finalUrl
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      navigate(e.currentTarget.value)
    }
  }

  const goBack = (): void => {
    const iframe = webviewRef.current?.querySelector('iframe') as HTMLIFrameElement
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.history.back()
      } catch {}
    }
  }

  const goForward = (): void => {
    const iframe = webviewRef.current?.querySelector('iframe') as HTMLIFrameElement
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.history.forward()
      } catch {}
    }
  }

  const reload = (): void => {
    const iframe = webviewRef.current?.querySelector('iframe') as HTMLIFrameElement
    if (iframe) {
      setLoading(true)
      iframe.src = iframe.src
    }
  }

  const handleLoad = (): void => {
    setLoading(false)
    try {
      const iframe = webviewRef.current?.querySelector('iframe') as HTMLIFrameElement
      if (iframe?.contentDocument) {
        setTitle(iframe.contentDocument.title || url)
      }
      if (iframe?.contentWindow) {
        setCanGoBack(iframe.contentWindow.history.length > 1)
        setCanGoForward(false)
      }
    } catch {}
  }

  if (!isOpen) return null

  return (
    <div className="browser-panel">
      <div className="browser-toolbar">
        <button className="browser-btn" onClick={onClose} title="Close browser">✕</button>
        <button className="browser-btn" onClick={goBack} disabled={!canGoBack} title="Back">←</button>
        <button className="browser-btn" onClick={goForward} disabled={!canGoForward} title="Forward">→</button>
        <button className="browser-btn" onClick={reload} title="Reload">⟳</button>
        <input
          type="text"
          className="browser-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL..."
        />
        {loading && <span className="browser-loading">Loading...</span>}
      </div>
      <div className="browser-content" ref={webviewRef}>
        <iframe
          src={url}
          onLoad={handleLoad}
          title={title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
        />
      </div>
    </div>
  )
}