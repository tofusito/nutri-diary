/** iOS does not shrink the layout viewport when the keyboard opens: fixed
 *  elements stay where they were and a bottom-anchored sheet ends up behind the
 *  keys. These variables describe the part of the screen actually on show, so
 *  the sheet can live inside it. */
export function trackViewport() {
  const viewport = window.visualViewport
  const root = document.documentElement
  if (!viewport) return
  const apply = () => {
    root.style.setProperty('--vv-height', `${Math.round(viewport.height)}px`)
    root.style.setProperty('--vv-top', `${Math.round(viewport.offsetTop)}px`)
  }
  apply()
  viewport.addEventListener('resize', apply)
  viewport.addEventListener('scroll', apply)
}
