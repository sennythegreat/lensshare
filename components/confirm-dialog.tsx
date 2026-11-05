'use client'

import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

/**
 * Shared confirmation modal for irreversible / consequential actions.
 * House pattern: fixed backdrop + inline <section role="dialog"> (no portal),
 * like components/report-incident-modal.tsx. Stacks above existing modals
 * (z-index 120 vs their 100).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  requireReason = false,
  reasonLabel = 'Reason (required)',
  reasonPlaceholder = 'Add a short reason for the record…',
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  busy?: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  if (!open) return null

  const reasonMissing = requireReason && !reason.trim()

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.currentTarget === event.target) onClose()
      }}
    >
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className={`confirm-dialog-icon ${tone}`}>
          <TriangleAlert size={18} aria-hidden="true" />
        </div>
        <h2 id="confirm-dialog-title">{title}</h2>
        {description && <div className="confirm-dialog-body">{description}</div>}
        {requireReason && (
          <label className="confirm-dialog-reason">
            <span>{reasonLabel}</span>
            <textarea
              value={reason}
              maxLength={600}
              rows={3}
              placeholder={reasonPlaceholder}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
            />
          </label>
        )}
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog-confirm ${tone}`}
            disabled={busy || reasonMissing}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
