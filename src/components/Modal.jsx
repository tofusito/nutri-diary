import { useEffect, useRef } from 'react'

export default function Modal({ title, children, onClose }) {
  const dialog = useRef(null)
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!dialog.current.contains(document.activeElement)) dialog.current.focus()
    const keydown = event => {
      // Nested sheets own their own focus and Escape handling.
      if (dialog.current !== [...document.querySelectorAll('[role="dialog"]')].at(-1)) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const elements = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(el => el.getClientRects().length)
      const first = elements[0], last = elements.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus() }
  }, [])
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section ref={dialog} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}><header><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></header>{children}</section></div>
}
