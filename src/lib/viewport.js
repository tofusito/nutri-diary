/** How much of the bottom of the fixed-position coordinate space the on-screen
 *  keyboard covers.
 *
 *  This cannot be derived from visualViewport alone. Blink positions fixed
 *  elements against the layout viewport, which the keyboard does not shrink, so
 *  the inset is the difference between the two. WebKit reattaches them to the
 *  visual viewport, where the keyboard is already excluded and the same formula
 *  double counts — which is what left a strip of the page showing under a
 *  sheet. Rather than branch on the engine, a real fixed element is measured:
 *  the answer is then correct in both, and in whatever they do next. */
export function trackViewport() {
  const viewport = window.visualViewport
  const root = document.documentElement
  if (!viewport) return

  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;pointer-events:none;visibility:hidden'
  document.body.append(probe)

  const apply = () => {
    // Both sides in client coordinates: where a fixed bottom lands, against
    // where the part of the page the user can actually see ends.
    const fixedBottom = probe.getBoundingClientRect().bottom
    const visibleBottom = viewport.offsetTop + viewport.height
    root.style.setProperty('--keyboard-inset', `${Math.max(0, Math.round(fixedBottom - visibleBottom))}px`)
  }
  // iOS raises the keyboard in stages and the suggestion bar can appear, grow
  // or vanish while typing without a reliable resize event, so the measurement
  // is repeated for as long as something is focused rather than taken once.
  let watching = 0
  const watch = () => {
    clearInterval(watching)
    apply()
    watching = setInterval(apply, 250)
    setTimeout(() => { clearInterval(watching); watching = 0; apply() }, 4_000)
  }
  apply()
  viewport.addEventListener('resize', apply)
  viewport.addEventListener('scroll', apply)
  addEventListener('focusin', watch)
  addEventListener('focusout', watch)
}
