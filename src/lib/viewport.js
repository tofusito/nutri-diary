/** iOS does not shrink the layout viewport when the keyboard opens: fixed
 *  elements stay where they were and a bottom-anchored sheet ends up behind the
 *  keys. What a sheet needs is how much of the bottom is covered, which is the
 *  part of the layout viewport the visual viewport no longer reaches. Anchoring
 *  to that inset avoids depending on where iOS decided to scroll to. */
export function trackViewport() {
  const viewport = window.visualViewport
  const root = document.documentElement
  if (!viewport) return
  const apply = () => {
    const inset = root.clientHeight - viewport.height - viewport.offsetTop
    root.style.setProperty('--keyboard-inset', `${Math.max(0, Math.round(inset))}px`)
  }
  apply()
  viewport.addEventListener('resize', apply)
  viewport.addEventListener('scroll', apply)
}
