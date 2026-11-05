'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Eraser, RotateCcw, ShieldCheck, Signature, Upload, X } from 'lucide-react'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ACCEPTED_IMAGE_INPUT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'
const EXPORT_WIDTH = 1200
const EXPORT_HEIGHT = 450

type Point = { x: number; y: number }
type Stroke = { points: Point[] }

export type SignatureCaptureMethod = 'drawn' | 'uploaded'

export type AgreementSignatureDialogProps = {
  open: boolean
  busy: boolean
  signerParty: 'owner' | 'renter'
  signerName: string
  onClose: () => void
  onSubmit: (file: File, captureMethod: SignatureCaptureMethod) => Promise<void>
}

type ClearedContent =
  | { captureMethod: 'drawn'; strokes: Stroke[] }
  | { captureMethod: 'uploaded'; file: File; image: HTMLImageElement }

type PendingImageLoad = {
  promise: Promise<HTMLImageElement>
  cancel: () => void
  finish: () => void
}

export function AgreementSignatureDialog({
  open,
  busy,
  signerParty,
  signerName,
  onClose,
  onSubmit,
}: AgreementSignatureDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const canvasLabelId = useId()
  const canvasHelpId = useId()
  const fileInputId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const uploadedImageRef = useRef<HTMLImageElement | null>(null)
  const clearedContentRef = useRef<ClearedContent | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const pendingImageLoadRef = useRef<PendingImageLoad | null>(null)
  const modeRef = useRef<SignatureCaptureMethod>('drawn')
  const openRef = useRef(open)
  const closeRef = useRef(onClose)
  const onSubmitRef = useRef(onSubmit)
  const busyRef = useRef(busy)
  const internalSubmitRef = useRef(false)

  const [captureMethod, setCaptureMethod] = useState<SignatureCaptureMethod>('drawn')
  const [hasDrawnContent, setHasDrawnContent] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [canvasRevision, setCanvasRevision] = useState(0)

  const isBusy = busy || submitting
  const interactionDisabled = isBusy || uploadLoading
  const hasCurrentContent = captureMethod === 'drawn' ? hasDrawnContent : Boolean(uploadedFile)

  openRef.current = open
  closeRef.current = onClose
  onSubmitRef.current = onSubmit
  busyRef.current = isBusy
  modeRef.current = captureMethod

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 3)
    const pixelWidth = Math.max(1, Math.round(bounds.width * pixelRatio))
    const pixelHeight = Math.max(1, Math.round(bounds.height * pixelRatio))
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }

    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    paintSignature(
      context,
      bounds.width,
      bounds.height,
      modeRef.current,
      strokesRef.current,
      uploadedImageRef.current,
    )
  }, [])

  useEffect(() => {
    if (open) {
      cancelPendingImageLoad(pendingImageLoadRef)
      releaseStoredImages(uploadedImageRef, clearedContentRef)
      strokesRef.current = []
      activePointerRef.current = null
      setCaptureMethod('drawn')
      setHasDrawnContent(false)
      setUploadedFile(null)
      setAcknowledged(false)
      setCanRedo(false)
      setUploadLoading(false)
      internalSubmitRef.current = false
      setSubmitting(false)
      setError('')
      setCanvasRevision((revision) => revision + 1)
      return
    }

    cancelPendingImageLoad(pendingImageLoadRef)
    releaseStoredImages(uploadedImageRef, clearedContentRef)
    strokesRef.current = []
    activePointerRef.current = null
    setUploadLoading(false)
  }, [open])

  useEffect(() => () => {
    cancelPendingImageLoad(pendingImageLoadRef)
    releaseStoredImages(uploadedImageRef, clearedContentRef)
  }, [])

  useEffect(() => {
    if (!open) return

    const resize = () => renderPreview()
    const frame = window.requestAnimationFrame(resize)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    if (canvasRef.current) observer?.observe(canvasRef.current)
    window.addEventListener('resize', resize)

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [open, renderPreview])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(renderPreview)
    return () => window.cancelAnimationFrame(frame)
  }, [canvasRevision, captureMethod, open, renderPreview, uploadedFile])

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusFrame = window.requestAnimationFrame(() => {
      if (!closeButtonRef.current?.disabled) closeButtonRef.current?.focus()
      else dialogRef.current?.focus()
    })

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!busyRef.current) {
          event.preventDefault()
          closeRef.current()
        }
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), [href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0)

      if (!focusable.length) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [open])

  function discardRedoContent() {
    const cleared = clearedContentRef.current
    if (cleared?.captureMethod === 'uploaded' && cleared.image !== uploadedImageRef.current) {
      releaseImage(cleared.image)
    }
    clearedContentRef.current = null
    setCanRedo(false)
  }

  function selectCaptureMethod(nextMethod: SignatureCaptureMethod) {
    if (interactionDisabled || nextMethod === captureMethod) return
    activePointerRef.current = null
    setCaptureMethod(nextMethod)
    setAcknowledged(false)
    setError('')
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (interactionDisabled || captureMethod !== 'drawn') return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    const point = pointFromClient(event.currentTarget, event.clientX, event.clientY)
    if (!point) return

    event.preventDefault()
    discardRedoContent()
    activePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    strokesRef.current = [...strokesRef.current, { points: [point] }]
    setHasDrawnContent(true)
    setAcknowledged(false)
    setError('')
    renderPreview()
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (interactionDisabled || captureMethod !== 'drawn' || activePointerRef.current !== event.pointerId) return
    event.preventDefault()

    const currentStroke = strokesRef.current[strokesRef.current.length - 1]
    if (!currentStroke) return

    const samples = event.nativeEvent.getCoalescedEvents?.()
    const pointerSamples = samples?.length ? samples : [event.nativeEvent]
    for (const sample of pointerSamples) {
      const point = pointFromClient(event.currentTarget, sample.clientX, sample.clientY)
      const previousPoint = currentStroke.points[currentStroke.points.length - 1]
      if (point && (!previousPoint || pointDistance(point, previousPoint) > 0.001)) {
        currentStroke.points.push(point)
      }
    }
    renderPreview()
  }

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    activePointerRef.current = null
    setCanvasRevision((revision) => revision + 1)
  }

  function clearCurrentContent() {
    if (interactionDisabled || !hasCurrentContent) return
    discardRedoContent()

    if (captureMethod === 'drawn') {
      clearedContentRef.current = {
        captureMethod: 'drawn',
        strokes: cloneStrokes(strokesRef.current),
      }
      strokesRef.current = []
      setHasDrawnContent(false)
    } else if (uploadedFile && uploadedImageRef.current) {
      clearedContentRef.current = {
        captureMethod: 'uploaded',
        file: uploadedFile,
        image: uploadedImageRef.current,
      }
      uploadedImageRef.current = null
      setUploadedFile(null)
    }

    activePointerRef.current = null
    setCanRedo(Boolean(clearedContentRef.current))
    setAcknowledged(false)
    setError('')
    setCanvasRevision((revision) => revision + 1)
  }

  function redoClearedContent() {
    if (interactionDisabled || !clearedContentRef.current) return
    const cleared = clearedContentRef.current
    clearedContentRef.current = null
    setCanRedo(false)
    setAcknowledged(false)
    setError('')
    setCaptureMethod(cleared.captureMethod)

    if (cleared.captureMethod === 'drawn') {
      strokesRef.current = cloneStrokes(cleared.strokes)
      setHasDrawnContent(cleared.strokes.length > 0)
    } else {
      if (uploadedImageRef.current && uploadedImageRef.current !== cleared.image) {
        releaseImage(uploadedImageRef.current)
      }
      uploadedImageRef.current = cleared.image
      setUploadedFile(cleared.file)
    }
    setCanvasRevision((revision) => revision + 1)
  }

  async function chooseUploadedSignature(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file || interactionDisabled) return

    if (!ACCEPTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      setError('Choose a JPG, PNG, or WebP image.')
      return
    }
    if (!file.size) {
      setError('That image is empty. Choose another file.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('The signature image must be 5 MB or smaller.')
      return
    }

    cancelPendingImageLoad(pendingImageLoadRef)
    setUploadLoading(true)
    setError('')
    const pendingLoad = loadImageFile(file)
    pendingImageLoadRef.current = pendingLoad

    try {
      const image = await pendingLoad.promise
      if (!openRef.current || pendingImageLoadRef.current !== pendingLoad) {
        releaseImage(image)
        return
      }

      pendingLoad.finish()
      pendingImageLoadRef.current = null
      if (uploadedImageRef.current) releaseImage(uploadedImageRef.current)
      discardRedoContent()
      uploadedImageRef.current = image
      setUploadedFile(file)
      setAcknowledged(false)
      setCanvasRevision((revision) => revision + 1)
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return
      if (openRef.current) {
        setError(cause instanceof Error ? cause.message : 'The signature image could not be read.')
      }
    } finally {
      if (pendingImageLoadRef.current === pendingLoad) {
        pendingImageLoadRef.current = null
        if (openRef.current) setUploadLoading(false)
      }
    }
  }

  async function submitSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isBusy || internalSubmitRef.current) return
    if (!hasCurrentContent) {
      setError(captureMethod === 'drawn' ? 'Draw your signature before continuing.' : 'Choose a signature image before continuing.')
      return
    }
    if (!acknowledged) {
      setError('Confirm the acknowledgment before saving your signature.')
      return
    }

    internalSubmitRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const output = document.createElement('canvas')
      output.width = EXPORT_WIDTH
      output.height = EXPORT_HEIGHT
      const context = output.getContext('2d')
      if (!context) throw new Error('Your browser could not prepare the signature image.')

      paintSignature(
        context,
        EXPORT_WIDTH,
        EXPORT_HEIGHT,
        captureMethod,
        strokesRef.current,
        uploadedImageRef.current,
      )
      if (!canvasHasVisibleInk(context, EXPORT_WIDTH, EXPORT_HEIGHT)) {
        throw new Error(captureMethod === 'drawn'
          ? 'The signature pad appears blank. Please draw your signature again.'
          : 'That image appears blank. Choose a visible signature image.')
      }

      const blob = await canvasToPngBlob(output)
      const normalizedFile = new File(
        [blob],
        `lensshare-${signerParty}-signature.png`,
        { type: 'image/png', lastModified: Date.now() },
      )
      const submitMethod = captureMethod
      await onSubmitRef.current(normalizedFile, submitMethod)
      if (openRef.current) closeRef.current()
    } catch (cause) {
      if (openRef.current) {
        setError(cause instanceof Error ? cause.message : 'The signature could not be saved.')
      }
    } finally {
      internalSubmitRef.current = false
      setSubmitting(false)
    }
  }

  if (!open) return null

  const partyLabel = signerParty === 'owner' ? 'Owner' : 'Renter'
  const displayName = signerName.trim() || `${partyLabel} signer`

  return (
    <div
      className="agreement-signature-dialog-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (!isBusy && event.currentTarget === event.target) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className="agreement-signature-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isBusy}
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          className="agreement-signature-dialog-close"
          type="button"
          aria-label="Close signature dialog"
          disabled={isBusy}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>

        <header className="agreement-signature-dialog-header">
          <span className="agreement-signature-dialog-eyebrow">{partyLabel.toUpperCase()} SIGNATURE</span>
          <h2 id={titleId}>Add your signature</h2>
          <p id={descriptionId}>
            {displayName}, draw below or upload a clear signature image. LensShare will save a clean PNG copy with the original image metadata removed.
          </p>
        </header>

        <form className="agreement-signature-dialog-form" onSubmit={submitSignature}>
          <div className="agreement-signature-dialog-methods" role="group" aria-label="Signature capture method">
            <button
              type="button"
              className={captureMethod === 'drawn' ? 'active' : ''}
              aria-pressed={captureMethod === 'drawn'}
              disabled={interactionDisabled}
              onClick={() => selectCaptureMethod('drawn')}
            >
              <Signature size={16} aria-hidden="true" /> Draw signature
            </button>
            <button
              type="button"
              className={captureMethod === 'uploaded' ? 'active' : ''}
              aria-pressed={captureMethod === 'uploaded'}
              disabled={interactionDisabled}
              onClick={() => selectCaptureMethod('uploaded')}
            >
              <Upload size={16} aria-hidden="true" /> Upload image
            </button>
          </div>

          <div className="agreement-signature-dialog-workspace">
            <div className="agreement-signature-dialog-canvas-heading">
              <span id={canvasLabelId} className="agreement-signature-dialog-canvas-label">
                {captureMethod === 'drawn' ? 'Signature pad' : 'Signature preview'}
              </span>
              <span id={canvasHelpId}>{captureMethod === 'drawn' ? 'Mouse, touch, or pen' : 'Image is fitted without cropping'}</span>
            </div>
            <div className={`agreement-signature-dialog-canvas-frame ${captureMethod}`}>
              <canvas
                ref={canvasRef}
                role="img"
                aria-labelledby={canvasLabelId}
                aria-describedby={canvasHelpId}
                aria-disabled={interactionDisabled}
                onPointerDown={startDrawing}
                onPointerMove={continueDrawing}
                onPointerUp={finishDrawing}
                onPointerCancel={finishDrawing}
              >
                Your browser does not support the signature canvas. Use the upload option instead.
              </canvas>
              {!hasCurrentContent && (
                <span className="agreement-signature-dialog-canvas-placeholder" aria-hidden="true">
                  {captureMethod === 'drawn'
                    ? 'Sign inside this white area'
                    : uploadLoading ? 'Preparing image…' : 'Your uploaded signature will appear here'}
                </span>
              )}
            </div>

            <div className="agreement-signature-dialog-tools">
              <div>
                {captureMethod === 'uploaded' && (
                  <>
                    <input
                      ref={fileInputRef}
                      id={fileInputId}
                      type="file"
                      accept={ACCEPTED_IMAGE_INPUT}
                      hidden
                      disabled={interactionDisabled}
                      onChange={chooseUploadedSignature}
                    />
                    <button
                      type="button"
                      disabled={interactionDisabled}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} aria-hidden="true" /> {uploadedFile ? 'Replace image' : 'Choose image'}
                    </button>
                  </>
                )}
                <button type="button" disabled={interactionDisabled || !hasCurrentContent} onClick={clearCurrentContent}>
                  <Eraser size={14} aria-hidden="true" /> Clear
                </button>
                <button type="button" disabled={interactionDisabled || !canRedo} onClick={redoClearedContent}>
                  <RotateCcw size={14} aria-hidden="true" /> Redo
                </button>
              </div>
              <span className="agreement-signature-dialog-file-note" aria-live="polite">
                {uploadedFile
                  ? `${uploadedFile.name} · ${formatFileSize(uploadedFile.size)}`
                  : captureMethod === 'uploaded' ? 'JPG, PNG, or WebP · 5 MB maximum' : 'Clear, then Redo to restore the last cleared signature'}
              </span>
            </div>
          </div>

          <label className="agreement-signature-dialog-acknowledgment">
            <input
              type="checkbox"
              required
              checked={acknowledged}
              disabled={isBusy}
              onChange={(event) => {
                setAcknowledged(event.target.checked)
                setError('')
              }}
            />
            <span>
              <strong>I confirm this is my signature.</strong>
              I, {displayName}, am signing as the {signerParty} and accept the immutable rental agreement shown to me.
            </span>
          </label>

          <div className="agreement-signature-dialog-security-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>The submitted file is normalized to a white PNG canvas before it leaves this dialog.</span>
          </div>

          {error && <p className="agreement-signature-dialog-error" role="alert">{error}</p>}

          <footer className="agreement-signature-dialog-actions">
            <button type="button" disabled={isBusy} onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={isBusy || uploadLoading || !hasCurrentContent || !acknowledged}>
              <Signature size={15} aria-hidden="true" /> {isBusy ? 'Saving signature…' : `Sign as ${signerParty}`}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

function paintSignature(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  captureMethod: SignatureCaptureMethod,
  strokes: Stroke[],
  image: HTMLImageElement | null,
) {
  context.save()
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  if (captureMethod === 'uploaded' && image?.naturalWidth && image.naturalHeight) {
    const padding = Math.max(14, Math.min(width, height) * 0.08)
    const availableWidth = Math.max(1, width - padding * 2)
    const availableHeight = Math.max(1, height - padding * 2)
    const scale = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight)
    const drawWidth = image.naturalWidth * scale
    const drawHeight = image.naturalHeight * scale
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
  } else if (captureMethod === 'drawn') {
    const lineWidth = Math.max(2, Math.min(width, height) * 0.012)
    context.strokeStyle = '#07100e'
    context.fillStyle = '#07100e'
    context.lineWidth = lineWidth
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (const stroke of strokes) {
      if (!stroke.points.length) continue
      if (stroke.points.length === 1) {
        const point = stroke.points[0]
        context.beginPath()
        context.arc(point.x * width, point.y * height, lineWidth / 2, 0, Math.PI * 2)
        context.fill()
        continue
      }

      context.beginPath()
      context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height)
      for (let index = 1; index < stroke.points.length; index += 1) {
        const point = stroke.points[index]
        context.lineTo(point.x * width, point.y * height)
      }
      context.stroke()
    }
  }
  context.restore()
}

function pointFromClient(canvas: HTMLCanvasElement, clientX: number, clientY: number): Point | null {
  const bounds = canvas.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return null
  return {
    x: Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height)),
  }
}

function pointDistance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function cloneStrokes(strokes: Stroke[]): Stroke[] {
  return strokes.map((stroke) => ({ points: stroke.points.map((point) => ({ ...point })) }))
}

function canvasHasVisibleInk(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const pixels = context.getImageData(0, 0, width, height).data
  let inkPixels = 0
  const requiredInkPixels = Math.max(36, Math.floor(width * height * 0.00008))
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] > 10 && (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245)) {
      inkPixels += 1
      if (inkPixels >= requiredInkPixels) return true
    }
  }
  return false
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Your browser could not export the signature image.'))
    }, 'image/png')
  })
}

function loadImageFile(file: File): PendingImageLoad {
  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  let settled = false
  let revoked = false
  let rejectLoad: (reason?: unknown) => void = () => undefined

  function revokeUrl() {
    if (revoked) return
    URL.revokeObjectURL(objectUrl)
    revoked = true
  }

  function removeListeners() {
    image.onload = null
    image.onerror = null
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    rejectLoad = reject
    image.onload = () => {
      if (settled) return
      if (!image.naturalWidth || !image.naturalHeight) {
        settled = true
        removeListeners()
        revokeUrl()
        releaseImage(image)
        reject(new Error('That image has no readable dimensions.'))
        return
      }
      resolve(image)
    }
    image.onerror = () => {
      if (settled) return
      settled = true
      removeListeners()
      revokeUrl()
      releaseImage(image)
      reject(new Error('That image could not be decoded. Choose another JPG, PNG, or WebP file.'))
    }
    image.src = objectUrl
  })

  return {
    promise,
    finish: () => {
      if (settled) return
      settled = true
      removeListeners()
      revokeUrl()
    },
    cancel: () => {
      if (settled) return
      settled = true
      removeListeners()
      image.src = ''
      revokeUrl()
      const cancellation = new Error('Image loading was cancelled.')
      cancellation.name = 'AbortError'
      rejectLoad(cancellation)
    },
  }
}

function cancelPendingImageLoad(pendingRef: { current: PendingImageLoad | null }) {
  pendingRef.current?.cancel()
  pendingRef.current = null
}

function releaseStoredImages(
  uploadedImageRef: { current: HTMLImageElement | null },
  clearedContentRef: { current: ClearedContent | null },
) {
  const images = new Set<HTMLImageElement>()
  if (uploadedImageRef.current) images.add(uploadedImageRef.current)
  if (clearedContentRef.current?.captureMethod === 'uploaded') images.add(clearedContentRef.current.image)
  images.forEach(releaseImage)
  uploadedImageRef.current = null
  clearedContentRef.current = null
}

function releaseImage(image: HTMLImageElement) {
  image.onload = null
  image.onerror = null
  image.src = ''
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.0', '')} MB`
}
