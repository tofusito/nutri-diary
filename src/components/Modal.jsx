import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/** Two kinds of sheet, chosen by whether anyone types in it.
 *
 *  - `page` (default): anything with a text field. Full screen on a phone and
 *    pinned to the layout viewport by CSS alone, with its actions in the top
 *    bar where the keyboard can never cover them. Nothing about its size or
 *    position depends on the keyboard, so there is nothing to jump.
 *  - `sheet`: pickers and confirmations with no typing. A bottom sheet, which
 *    is comfortable one-handed and safe precisely because no keyboard opens.
 *
 *  Children render inside `.modal-body`, the sheet's single scroll area.
 */
export default function Modal({ title, children, onClose, variant = 'page', primary = null, action = null, className = '', footer = null }) {
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

  return createPortal(
    <div className={`modal-backdrop modal-backdrop-${variant}`} role="presentation" onMouseDown={variant === 'sheet' ? onClose : undefined}>
      <section ref={dialog} tabIndex={-1} className={`modal modal-${variant} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <div className="modal-actions">
            {action}
            {primary}
            <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">×</button>
          </div>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </section>
    </div>,
    document.body,
  )
}
