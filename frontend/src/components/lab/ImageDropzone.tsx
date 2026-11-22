import React, { useEffect, useRef, useState } from 'react'
import { ImagePlus, Upload } from 'lucide-react'

// Formats the backend (multer + OpenCV) can read, and its upload size limit.
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp']
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const MAX_QUEUE_SIZE = 50

export interface RejectedFile {
  name: string
  reason: string
}

/** Same file picked twice (by name, size and modified time). */
export const fileKey = (file: File): string => `${file.name}::${file.size}::${file.lastModified}`

function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return true
  // Some drag sources leave `type` empty, so fall back to the extension.
  const name = file.name.toLowerCase()
  return file.type === '' && ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/** Splits picked files into the ones to queue and the ones to skip (with a reason). */
export function validateImageFiles(
  files: File[],
  existingKeys: Set<string>,
  room: number,
): { accepted: File[]; rejected: RejectedFile[] } {
  const accepted: File[] = []
  const rejected: RejectedFile[] = []
  const seen = new Set(existingKeys)

  for (const file of files) {
    const key = fileKey(file)
    if (!isAcceptedImage(file)) rejected.push({ name: file.name, reason: 'not a JPG, PNG, WEBP or BMP image' })
    else if (file.size > MAX_IMAGE_BYTES) rejected.push({ name: file.name, reason: 'larger than 15 MB' })
    else if (seen.has(key)) rejected.push({ name: file.name, reason: 'already added' })
    else if (accepted.length >= room) rejected.push({ name: file.name, reason: `queue is full (max ${MAX_QUEUE_SIZE})` })
    else {
      seen.add(key)
      accepted.push(file)
    }
  }
  return { accepted, rejected }
}

export interface ImageDropzoneProps {
  onFiles: (files: File[]) => void
  disabled?: boolean
  /** Smaller layout once images are already queued. */
  compact?: boolean
  /** Also accept images pasted with Ctrl+V anywhere on the page. */
  acceptPaste?: boolean
}

export default function ImageDropzone({ onFiles, disabled = false, compact = false, acceptPaste = true }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)

  // Paste screenshots / copied images straight into the queue.
  useEffect(() => {
    if (!acceptPaste || disabled) return
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      onFiles(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [acceptPaste, disabled, onFiles])

  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes('Files')

  const handleDragEnter = (event: React.DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    if (!disabled) setDragging(true)
  }

  const handleDragOver = (event: React.DragEvent) => {
    if (!hasFiles(event)) return
    // Without preventDefault the browser opens the dropped image and leaves the dashboard.
    event.preventDefault()
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
  }

  const handleDragLeave = (event: React.DragEvent) => {
    if (!hasFiles(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (disabled) return
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }

  const openPicker = () => {
    if (!disabled) inputRef.current?.click()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPicker()
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    // Reset so picking the same file again still fires a change event.
    event.target.value = ''
    if (files.length > 0) onFiles(files)
  }

  const stateClass = disabled
    ? 'cursor-not-allowed border-line opacity-60'
    : dragging
    ? 'cursor-copy border-brine-600 bg-brine-600/10 ring-2 ring-brine-600/30'
    : 'cursor-pointer border-line hover:border-brine-600 focus-visible:border-brine-600'

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Add salt sample images: click to browse, drag and drop, or paste"
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-canvas text-center outline-none transition-colors ${
        compact ? 'gap-1 px-4 py-5 sm:flex-row sm:gap-3' : 'px-6 py-14'
      } ${stateClass}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={handleInputChange}
        className="hidden"
        tabIndex={-1}
      />

      {dragging ? (
        <ImagePlus className={`${compact ? 'size-6' : 'size-10'} text-brine-600`} aria-hidden="true" />
      ) : (
        <Upload className={`${compact ? 'size-6' : 'size-10'} text-ink-400`} aria-hidden="true" />
      )}

      <div className={compact ? 'sm:text-left' : ''}>
        <p className={`font-semibold text-ink-900 ${compact ? 'text-sm' : 'mt-4 text-base'}`}>
          {dragging ? 'Drop images to add them' : compact ? 'Add more images' : 'Drag & drop salt sample photos here'}
        </p>
        <p className={`text-xs text-ink-500 ${compact ? '' : 'mt-1'}`}>
          or <span className="font-semibold text-brine-600 underline underline-offset-2">browse</span> · paste with Ctrl+V ·
          JPG, PNG, WEBP, BMP · up to 15 MB each · max {MAX_QUEUE_SIZE} images
        </p>
      </div>
    </div>
  )
}
