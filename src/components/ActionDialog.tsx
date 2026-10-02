import { AlertTriangle, ShieldCheck, X } from 'lucide-react'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Shared, accessible confirmation form for administrative actions. */
export type ActionDialogRequest = {
  title: string
  description: string
  confirmLabel: string
  tone?: 'default' | 'danger'
  inputLabel?: string
  inputPlaceholder?: string
  requiredInput?: string
  acknowledgement?: string
  onConfirm: (input: string) => Promise<void>
}

type Props = {
  request: ActionDialogRequest
  onClose: () => void
}

export function ActionDialog({ request, onClose }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const validInput = request.requiredInput !== undefined
    ? value.trim() === request.requiredInput
    : !request.inputLabel || value.trim().length > 0
  const canSubmit = validInput && (!request.acknowledgement || acknowledged) && !busy

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ;(inputRef.current ?? cancelRef.current)?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busy) { event.preventDefault(); onClose() }
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'
      )).filter((item) => item.getClientRects().length > 0)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      await request.onConfirm(value.trim())
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete the action. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="action-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div ref={panelRef} className="action-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="action-dialog__top">
          <div className={`action-dialog__icon${request.tone === 'danger' ? ' action-dialog__icon--danger' : ''}`}>
            {request.tone === 'danger' ? <AlertTriangle aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          </div>
          <button type="button" className="action-dialog__close" aria-label="Close dialog" onClick={onClose} disabled={busy}><X /></button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <h2 id={titleId}>{request.title}</h2>
          <p id={descriptionId}>{request.description}</p>
          {request.inputLabel ? <label className="field action-dialog__field">
            <span>{request.inputLabel}</span>
            <input ref={inputRef} type="text" autoComplete="off" spellCheck={false} value={value} onChange={(event) => setValue(event.target.value)} placeholder={request.inputPlaceholder} required />
          </label> : null}
          {request.acknowledgement ? <label className="action-dialog__acknowledgement">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>{request.acknowledgement}</span>
          </label> : null}
          {error ? <div role="alert" className="action-dialog__error">{error}</div> : null}
          <div className="action-dialog__actions">
            <button ref={cancelRef} className="button button--small button--outline" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className={`button button--small ${request.tone === 'danger' ? 'button--danger' : 'button--primary'}`} type="submit" disabled={!canSubmit}>{busy ? 'Working…' : request.confirmLabel}</button>
          </div>
        </form>
      </div>
    </div>, document.body
  )
}
