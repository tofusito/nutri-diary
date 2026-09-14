# Visual refresh — 2026-09-14

Local implementation based on main at de4e8f2. Not deployed.

## Direction

Neutral graphite surfaces, restrained lavender energy/accent colour, amber carbohydrates, blue protein and pink fat. Separate meal cards, a floating translucent navigation capsule with a sliding selection, and short sheet/page entrance animations. Reduced motion disables transitions and animations; reduced transparency and unsupported blur get an opaque navigation surface. No new runtime dependency.

The PWA remains standalone. The manifest and Apple touch icon now reference versioned noodle PNG filenames; the shell cache version advances to v3. Existing installed iOS shortcuts may require removal and reinstallation after deployment to pick up a new icon.

## Artwork

Built-in image generation produced `public/noodle-master.png`. `node scripts/generate-icons.mjs` exports 180, 192 and 512 pixel app assets. The previous SVG and PNG artwork is retained for comparison. No maskable claim is made for the generated artwork.

Prompt: Create a finished premium iPhone home screen app icon, square full bleed, no rounded outer corners. Minimal Chinese noodle bowl: ivory ceramic bowl with a vermilion rim, dark charcoal chopsticks lifting three golden noodle curves. Warm off-white background, generous negative space, bold at small sizes, very subtle ceramic depth. No text, border, mockup, extra ingredients or emoji aesthetic.

## Verification

Production build and diff whitespace check passed. Temporary local MongoDB used for browser checks: four tabs, add-food sheet, widths 320–1280px, reduced motion and no JavaScript errors. Screenshots in ignored `test-results/redesign-diary.png` and `test-results/redesign-sheet.png`. No production data used. Physical iPhone camera, keyboard and installation behaviour have not been retested as part of this visual refresh.

## References

- https://help.macrofactorapp.com/en/articles/22-get-to-know-your-dashboard
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
