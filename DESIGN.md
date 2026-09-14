# Visual refresh — 2026-09-14

Implementation on `refactor/visual-refresh`, deployed from the homelab after pull and image rebuild.

## Direction

Neutral graphite surfaces, restrained lavender energy/accent colour, amber carbohydrates, blue protein and pink fat. Separate meal cards, a floating translucent navigation capsule with a sliding selection, and short sheet/page entrance animations. Reduced motion disables transitions and animations; reduced transparency and unsupported blur get an opaque navigation surface. No new runtime dependency.

The PWA remains standalone. The manifest and Apple touch icon now reference versioned noodle PNG filenames; the shell cache version advances to v3. Existing installed iOS shortcuts may require removal and reinstallation after deployment to pick up a new icon.

## Artwork

Built-in image generation produced `public/noodle-master.png`. `node scripts/generate-icons.mjs` exports 180, 192 and 512 pixel app assets. The previous SVG and PNG artwork is retained for comparison. No maskable claim is made for the generated artwork.

Prompt: Create a finished premium iPhone home screen app icon, square full bleed, no rounded outer corners. Minimal Chinese noodle bowl: ivory ceramic bowl with a vermilion rim, dark charcoal chopsticks lifting three golden noodle curves. Warm off-white background, generous negative space, bold at small sizes, very subtle ceramic depth. No text, border, mockup, extra ingredients or emoji aesthetic.

## Verification

Production build, API tests and diff whitespace check passed. The stability browser check uses a temporary MongoDB and a mobile browser to exercise empty, negative, zero and decimal macros; profile and food persistence; failed saves with draft retention; idempotent retries; invalid portions; offline queue and synchronization; all four tabs at 320–1280px; and uncaught-error detection. No production data is used. Screenshots are in ignored `test-results/redesign-diary.png` and `test-results/redesign-sheet.png`. Physical iPhone camera, keyboard and installation behaviour have not been retested as part of this visual refresh.

The zero-value crash was caused by an intermediate empty input being converted to null and then passed to the strict calorie calculation during render. The form now treats null as incomplete, keeps zero as a valid value, and reports validation inline. A screen-level error boundary remains as a final visible recovery path if an unexpected catalog or diary record is malformed.

## References

## Homelab authentication

`deploy/cloudflare-auth.yaml` is installed as `compose.override.yaml` beside the homelab stack. It selects `AUTH_MODE=cloudflare` and clears the app password/session secret in the container. Authentication is delegated entirely to Cloudflare Access; this mode does not validate Access JWTs at the origin. Keep the origin without published ports and the frontend network restricted to this app and its tunnel. Never bypass Access for `/api/*` or the diary. Logout redirects to Cloudflare's logout endpoint.

Home screen icon: the correct PNG is deployed, but Access also redirects unauthenticated PNG requests. A narrowly scoped public exception for the three `/noodle-{180,192,512}.png` paths is pending dashboard access. The real iOS installation flow still needs verification after that change.

- https://help.macrofactorapp.com/en/articles/22-get-to-know-your-dashboard
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
