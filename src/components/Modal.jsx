import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({ title, children, onClose, tall = false, action = null, className = '' }) {
  const dialog = useRef(null)
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!dialog.current.contains(document.activeElement)) dialog.current.focus({ preventScroll: true })
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
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section ref={dialog} tabIndex={-1} className={`modal ${tall ? 'modal-tall' : ''} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}><header><h2>{title}</h2><div className="modal-actions">{action}<button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></div></header>{children}</section></div>, document.body)
}
