# Nutri visual identity

Nutri is a small, calm nutrition diary. Its visual language should feel like a focused mobile app rather than a dashboard: dark graphite surfaces, generous spacing, clear macro colours and short, purposeful motion.

## App icon

The final mark is a warm cream noodle bowl on a vivid vermilion-red rounded-square field, with golden noodles and charcoal chopsticks. The bowl is the focal point and must remain legible at Home Screen size.

`public/noodle-master.png` is the source asset. Run `npm run icons` to generate the 180, 192 and 512 pixel variants and their shadowed counterparts. The shadowed files are used by the manifest, favicon and Apple touch metadata.

Keep the red bowl variant consistent across:

- repository artwork and README
- browser favicon and Apple touch icon
- installable PWA manifest icons
- any future launch-screen or sharing artwork

## Interface direction

- Use the dark graphite canvas as the main surface and the red icon as a warm accent, not as a replacement for the app's dark theme.
- Keep cards layered, rounded and softly outlined so sheets and content feel native on a phone.
- Preserve the established macro colours: amber for carbohydrates, blue for protein and pink for fat.
- Prefer spacing and hierarchy over extra decoration. Motion should be brief and respect `prefers-reduced-motion`.
- Treat the add-food sheet as a mobile-first flow: stable positioning, a scrollable result area and controls that remain reachable while the keyboard is open.

## PWA cache

When replacing an icon or another install asset, bump the shell cache version in `public/sw.js`. Existing Home Screen shortcuts may need to be removed and added again before iOS displays a newly cached icon.
