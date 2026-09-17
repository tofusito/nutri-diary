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

- Use graphite `#101114`, charcoal cards `#1c1d21` and warm-white text `#f5f1e9`.
- Primary actions use vermilion `#c9362b` with warm-white `#fff8f0` labels. Focus, links and active navigation use the lighter `#ff9588` for contrast against dark surfaces. Selected controls use translucent red with a fine red outline.
- Energy and remaining amounts use neutral cream; colour is reserved for macro identity, actions and explicit feedback.
- Keep cards layered, rounded and softly outlined so sheets and content feel native on a phone.
- Preserve the established macro colours: amber for carbohydrates, blue for protein and pink for fat.
- Prefer spacing and hierarchy over extra decoration. Motion should be brief and respect `prefers-reduced-motion`.
- Anything someone types into opens as a full-screen sheet with its actions in the top bar, so a keyboard can never cover them. Pickers and confirmations without typing stay bottom sheets. Sheets are pinned to the layout viewport in CSS and never sized by script, which is what keeps them still while the iOS keyboard opens.
- The floating navigation bar sits inside its own full-viewport fixed layer, with the bar itself bottom-aligned inside that layer. This keeps the dock anchored during iOS landscape-to-portrait rotation; while typing, the layer fades and becomes inert without applying a vertical transform to the bar.
- Add and close controls have 44 pixel targets. Confirmation uses a check mark and errors use an exclamation mark alongside explanatory text. Destructive confirmations have an outlined warning surface.
- Floating notifications and reversible deletion notices dismiss after five seconds. The undo action remains available for that full interval; validation errors inside forms remain until corrected.
- A habitual food already present in the selected meal stays in place with a persistent check and its quick-add button disabled. Tapping the row still opens the quantity view for an intentional second serving.
- The add-food sheet uses a plus icon for manual food creation and overlapping sheets for copying the previous day's selected meal. Both have 44 pixel touch targets and accessible labels. Desktop tooltips are supplementary; mobile help refers to the plus, and the copy sheet explains which day's meals will be copied.
- Every field that takes food or diary data opts out of Safari AutoFill (`src/lib/fields.js`): a food name is not a contact and a barcode is not a card number. Labels avoid the word "Nombre" where the field is not a person's name.

Validate text pairs against [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), and respect [reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion). Run `npm run build`, `npm run check` and `npm run screenshots` to verify the mobile flows and refresh documentation previews.

## PWA cache

When replacing an icon or another install asset, bump the shell cache version in `public/sw.js`. Existing Home Screen shortcuts may need to be removed and added again before iOS displays a newly cached icon.
