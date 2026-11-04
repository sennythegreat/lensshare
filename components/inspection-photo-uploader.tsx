'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Camera, Upload, X } from 'lucide-react'
import './rental-hub.css'

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_ACCEPT = 'image/jpeg,image/png,image/webp'

type InspectionPhotoUploaderProps = {
  label?: string
  description?: string
  disabled?: boolean
  busy?: boolean
  maxFiles?: number
  maxBytes?: number
  accept?: string
  onUpload: (files: File[]) => Promise<void> | void
}

type PendingPhoto = {
  file: File
  previewUrl: string
}

export function InspectionPhotoUploader({
  label = 'Add inspection photos',
  description = 'Use clear photos of the overall kit, serial plate, accessories, and any issue found.',
  disabled = false,
  busy = false,
  maxFiles = 6,
  maxBytes = DEFAULT_MAX_BYTES,
  accept = DEFAULT_ACCEPT,
  onUpload,
}: InspectionPhotoUploaderProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingPhoto[]>([])
  const [error, setError] = useState('')

  useEffect(() => () => {
    pending.forEach((item) => URL.revokeObjectURL(item.previewUrl))
  }, [pending])

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return

    const allowedTypes = new Set(accept.split(',').map((type) => type.trim()).filter(Boolean))
    const nextFiles = [...pending.map((item) => item.file), ...files]
    if (nextFiles.length > maxFiles) {
      setError(`Add no more than ${maxFiles} photos at a time.`)
      return
    }

    const invalid = files.find((file) => !allowedTypes.has(file.type) || !file.size || file.size > maxBytes)
    if (invalid) {
      setError(!allowedTypes.has(invalid.type)
        ? `${invalid.name} is not a JPG, PNG, or WebP image.`
        : !invalid.size
          ? `${invalid.name} is empty.`
          : `${invalid.name} is larger than ${formatBytes(maxBytes)}.`)
      return
    }

    setError('')
    setPending((current) => [...current, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))])
  }

  function removePhoto(index: number) {
    setPending((current) => {
      URL.revokeObjectURL(current[index]!.previewUrl)
      return current.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  async function submit() {
    if (!pending.length || disabled || busy) return
    setError('')
    try {
      await onUpload(pending.map((item) => item.file))
      pending.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      setPending([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The photos could not be uploaded.')
    }
  }

  return <section className="hub-photo-uploader" aria-labelledby={`${inputId}-label`}>
    <div className="hub-uploader-heading">
      <span className="hub-icon-box"><Camera size={17} /></span>
      <div><strong id={`${inputId}-label`}>{label}</strong><p>{description}</p></div>
    </div>

    {!!pending.length && <div className="hub-upload-previews" aria-label="Photos ready to upload">
      {pending.map((item, index) => <figure key={`${item.file.name}-${item.file.lastModified}-${index}`}>
        <img src={item.previewUrl} alt={`Preview of ${item.file.name}`} />
        <figcaption>{item.file.name}</figcaption>
        <button type="button" aria-label={`Remove ${item.file.name}`} disabled={disabled || busy} onClick={() => removePhoto(index)}><X size={13} /></button>
      </figure>)}
    </div>}

    <div className="hub-uploader-actions">
      <input ref={inputRef} id={inputId} type="file" accept={accept} multiple hidden disabled={disabled || busy} onChange={handleFiles} />
      <button type="button" className="hub-button secondary" disabled={disabled || busy || pending.length >= maxFiles} onClick={() => inputRef.current?.click()}><Camera size={14} /> Choose photos</button>
      <button type="button" className="hub-button primary" disabled={disabled || busy || !pending.length} onClick={submit}><Upload size={14} /> {busy ? 'Uploading…' : `Upload${pending.length ? ` ${pending.length}` : ''}`}</button>
    </div>
    <small className="hub-uploader-note">JPG, PNG, or WebP · up to {formatBytes(maxBytes)} each · {maxFiles} photos per upload</small>
    {error && <p className="hub-inline-error" role="alert">{error}</p>}
  </section>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${Math.round(bytes / (1024 * 1024))} MB`
}
