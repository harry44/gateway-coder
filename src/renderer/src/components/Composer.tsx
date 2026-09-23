import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type DragEvent } from 'react'

interface ImageData {
  dataUrl: string
  mediaType: string
  base64: string
}

interface FileAttachment {
  name: string
  type: string
  content: string
  size: number
}

interface Props {
  disabled: boolean
  running: boolean
  onSend: (text: string, images?: ImageData[], files?: FileAttachment[]) => void
  onStop: () => void
}

export default function Composer({ disabled, running, onSend, onStop }: Props): JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageData[]>([])
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [dragActive, setDragActive] = useState(false)

  const getTextContent = (): string => {
    return editorRef.current?.innerText ?? ''
  }

  const setTextContent = (value: string): void => {
    if (editorRef.current) {
      editorRef.current.innerText = value
      setText(value)
    }
  }

  const handlePaste = async (e: ClipboardEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault()
    const clipboardItems = e.clipboardData?.items
    if (!clipboardItems) return

    const newImages: ImageData[] = []
    const newFiles: FileAttachment[] = []
    for (const item of clipboardItems) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          const base64 = await fileToBase64(file)
          newImages.push({
            dataUrl: `data:${file.type};base64,${base64}`,
            mediaType: file.type,
            base64
          })
        }
      } else if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file && isTextFile(file)) {
          const content = await fileToText(file)
          newFiles.push({
            name: file.name,
            type: file.type,
            content,
            size: file.size
          })
        }
      }
    }

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages])
    }
    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles])
    } else {
      // Handle text paste
      const pastedText = e.clipboardData?.getData('text/plain') ?? ''
      if (pastedText) {
        document.execCommand('insertText', false, pastedText)
      }
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = e.dataTransfer?.files
    if (!droppedFiles || droppedFiles.length === 0) return

    const newFiles: FileAttachment[] = []
    for (const file of Array.from(droppedFiles)) {
      if (isTextFile(file)) {
        const content = await fileToText(file)
        newFiles.push({
          name: file.name,
          type: file.type,
          content,
          size: file.size
        })
      } else if (file.type.startsWith('image/')) {
        const base64 = await fileToBase64(file)
        setImages((prev) => [...prev, {
          dataUrl: `data:${file.type};base64,${base64}`,
          mediaType: file.type,
          base64
        }])
      }
    }
    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles])
    }
  }

  const handleFileSelect = async (): Promise<void> => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selectedFiles = e.target.files
    if (!selectedFiles || selectedFiles.length === 0) return

    const newFiles: FileAttachment[] = []
    for (const file of Array.from(selectedFiles)) {
      if (isTextFile(file)) {
        const content = await fileToText(file)
        newFiles.push({
          name: file.name,
          type: file.type,
          content,
          size: file.size
        })
      } else if (file.type.startsWith('image/')) {
        const base64 = await fileToBase64(file)
        setImages((prev) => [...prev, {
          dataUrl: `data:${file.type};base64,${base64}`,
          mediaType: file.type,
          base64
        }])
      }
    }
    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles])
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number): void => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleInput = (): void => {
    setText(getTextContent())
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const submit = (): void => {
    const t = text.trim()
    if ((!t && images.length === 0 && files.length === 0) || disabled) return
    onSend(t, images.length > 0 ? images : undefined, files.length > 0 ? files : undefined)
    setTextContent('')
    setImages([])
    setFiles([])
  }

  const handleContextMenu = (e: any): void => {
    // Let browser show native spellcheck suggestions on right-click
    // The browser automatically handles misspelled words with spellCheck={true}
  }

  const removeImage = (index: number): void => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="composer">
      <div className="composer-input">
        <div
          ref={editorRef}
          className={`editor ${dragActive ? 'drag-active' : ''}`}
          contentEditable={!disabled}
          spellCheck={true}
          onPaste={handlePaste}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => editorRef.current?.classList.add('focused')}
          onBlur={() => editorRef.current?.classList.remove('focused')}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onContextMenu={handleContextMenu}
          tabIndex={disabled ? -1 : 0}
          data-placeholder={disabled ? 'Open a workspace folder and set your key to start…' : 'Ask about your code, or describe a change…  (Enter to send, Shift+Enter for newline)'}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.log,.js,.ts,.tsx,.json,.md,.py,.cs,.java,.go,.rs,.cpp,.h,.css,.html,.xml,.yaml,.yml,.ini,.cfg,.conf,.env"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {(images.length > 0 || files.length > 0) && (
          <div className="attachments-previews">
            {images.length > 0 && (
              <div className="image-previews">
                {images.map((img, i) => (
                  <div key={i} className="image-preview">
                    <img src={img.dataUrl} alt="Pasted image" />
                    <button type="button" className="remove-img" onClick={() => removeImage(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {files.length > 0 && (
              <div className="file-previews">
                {files.map((file, i) => (
                  <div key={i} className="file-preview">
                    <span className="file-icon">📄</span>
                    <span className="file-name" title={`${file.name} (${formatSize(file.size)})`}>{file.name}</span>
                    <span className="file-size">{formatSize(file.size)}</span>
                    <button type="button" className="remove-img" onClick={() => removeFile(i)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="composer-actions">
          <button type="button" className="attach-btn" onClick={handleFileSelect} disabled={disabled} title="Attach file">
            📎
          </button>
        </div>
      </div>
      {running ? (
        <button className="btn stop" onClick={onStop} type="button">
          Stop
        </button>
      ) : (
        <button className="btn send" onClick={submit} disabled={disabled || (!text.trim() && images.length === 0 && files.length === 0)} type="button">
          Send
        </button>
      )}
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function isTextFile(file: File): boolean {
  const textTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/typescript',
    'application/xml',
    'application/yaml',
    'application/x-yaml',
  ]
  if (textTypes.some(t => file.type.startsWith(t))) return true
  const textExts = ['.txt', '.log', '.js', '.ts', '.tsx', '.json', '.md', '.py', '.cs', '.java', '.go', '.rs', '.cpp', '.h', '.css', '.html', '.xml', '.yaml', '.yml', '.ini', '.cfg', '.conf', '.env']
  return textExts.some(ext => file.name.toLowerCase().endsWith(ext))
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
