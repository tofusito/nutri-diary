/** Typing on a phone without fighting the phone.
 *
 *  The sheets used to follow `visualViewport` from script: every resize or
 *  scroll moved and resized a fixed overlay. On iOS those events arrive while
 *  the keyboard is still animating and while Safari is panning to reveal the
 *  focused field, so the overlay chased a moving target — moving the field,
 *  which made Safari pan again. That feedback loop was the jumping.
 *
 *  Nothing here resizes or moves layout any more. Sheets that take text are
 *  pinned to the layout viewport in CSS and never touched by script. This
 *  module only makes sure Safari never needs to pan:
 *
 *  - Once a field in a sheet takes focus it is scrolled up inside the sheet's
 *    own scroll area, well above any keyboard. Nothing moves before focus:
 *    shifting content under a finger mid-tap sends the tap somewhere else.
 *  - Safari may already be panning the whole screen to reveal the field. With
 *    the field lifted that pan is pointless and only drags the sheet, so it is
 *    undone — straight away and again once the keyboard has finished rising.
 *    It can never hide the field, which by then sits near the top.
 *  - When the keyboard closes, a known standalone-mode bug can leave WebKit
 *    believing the viewport is still short; forcing a reflow makes it re-read.
 *
 *  References: MDN VisualViewport; dev.to/cederhook on the standalone viewport
 *  that does not grow back; "iOS hates your modal" on keeping typing out of
 *  bottom sheets.
 */

const TEXT_ENTRY = [
  'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=color]):not([type=hidden])',
  'textarea',
  'select',
].join(',')

/** Below this fraction of the screen a field may end up under the keyboard. */
const SAFE_BOTTOM = 0.4
/** Where a lifted field lands, as a fraction of the screen from the top. */
const LANDING = 0.18

export const isTextEntry = element => element instanceof Element && element.matches(TEXT_ENTRY)

/** Long enough for the iOS keyboard to finish rising. */
const KEYBOARD_SETTLE_MS = 320

/** The sheet's own scroll area, never the document. */
const scrollAreaOf = field => field.closest('[role="dialog"]')?.querySelector('.modal-body') || null

/** Scroll a field up inside its sheet if the keyboard could cover it. */
export function liftField(field) {
  const area = scrollAreaOf(field)
  if (!area || !area.contains(field)) return false
  const box = field.getBoundingClientRect()
  const screen = window.innerHeight
  if (box.bottom <= screen * SAFE_BOTTOM) return false
  const areaTop = area.getBoundingClientRect().top
  const landing = Math.max(areaTop + 12, screen * LANDING)
  const before = area.scrollTop
  area.scrollTop = before + (box.top - landing)
  return area.scrollTop !== before
}

export function handleTyping() {
  const root = document.documentElement

  // A permanently invisible full-screen element. Toggling its display forces
  // WebKit to recompute the viewport after the keyboard leaves.
  const healer = document.createElement('div')
  healer.setAttribute('aria-hidden', 'true')
  healer.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1'
  document.body.append(healer)

  let leaving = 0
  let settling = 0

  const unpan = () => {
    if ((window.visualViewport?.offsetTop || 0) > 0 || window.scrollY !== 0) window.scrollTo(0, 0)
  }

  const onFocusIn = event => {
    const field = event.target
    if (!isTextEntry(field)) return
    clearTimeout(leaving)
    root.classList.add('typing')
    if (!field.closest('[role="dialog"]')) return
    liftField(field)
    // The page behind a sheet cannot scroll, so any pan is Safari's alone.
    clearTimeout(settling)
    requestAnimationFrame(unpan)
    settling = setTimeout(() => { liftField(field); unpan() }, KEYBOARD_SETTLE_MS)
  }

  const onFocusOut = () => {
    clearTimeout(leaving)
    leaving = setTimeout(() => {
      if (isTextEntry(document.activeElement)) return
      root.classList.remove('typing')
      healer.style.display = 'none'
      void healer.offsetHeight
      healer.style.display = ''
      if (document.querySelector('[role="dialog"]') && window.scrollY !== 0) window.scrollTo(0, 0)
    }, 140)
  }

  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)

  return () => {
    clearTimeout(leaving)
    clearTimeout(settling)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    healer.remove()
    root.classList.remove('typing')
  }
}
