/** Fit sheets to the visible viewport, including Safari's keyboard pan.
 * Measure the fixed coordinate origin instead of subtracting a guessed keyboard.
 * https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
 */
export function trackViewport() {
  const viewport = window.visualViewport
  if (!viewport) return () => {}
  const root = document.documentElement
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:fixed;inset:0;pointer-events:none;visibility:hidden'
  document.body.append(probe)
  let frame = 0
  let settle = 0
  const apply = () => {
    frame = 0
    const bounds = probe.getBoundingClientRect()
    root.style.setProperty('--sheet-top', `${viewport.offsetTop - bounds.top}px`)
    root.style.setProperty('--sheet-height', `${viewport.height}px`)
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(apply) }
  const focus = () => {
    schedule()
    clearTimeout(settle)
    settle = setTimeout(schedule, 350)
  }
  viewport.addEventListener('resize', schedule)
  viewport.addEventListener('scroll', schedule)
  viewport.addEventListener('scrollend', schedule)
  window.addEventListener('resize', schedule)
  document.addEventListener('focusin', focus)
  document.addEventListener('focusout', focus)
  apply()
  return () => {
    cancelAnimationFrame(frame)
    clearTimeout(settle)
    viewport.removeEventListener('resize', schedule)
    viewport.removeEventListener('scroll', schedule)
    viewport.removeEventListener('scrollend', schedule)
    window.removeEventListener('resize', schedule)
    document.removeEventListener('focusin', focus)
    document.removeEventListener('focusout', focus)
    probe.remove()
  }
}
