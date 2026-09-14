/** Exports the app icons from public/noodle-master.png.
 *  The master image was generated from this prompt, kept so the artwork can be
 *  reproduced in the same style: "Create a finished premium iPhone home screen
 *  app icon, square full bleed, no rounded outer corners. Minimal Chinese
 *  noodle bowl: large warm-cream ceramic bowl, vivid vermilion-red full-bleed
 *  background, charcoal chopsticks lifting golden noodles. Minimal dimensional
 *  illustration, bold at small sizes, no text, border, mockup, extra ingredients
 *  or emoji aesthetic. The red background reaches the square edges because iOS
 *  applies its own rounded mask.
 *  Edited with built-in image generation: preserve the selected bowl, noodles
 *  and chopsticks; remove only the transparent/checkerboard outer area and
 *  keep the red background full-bleed. No text, watermark or extra objects.
 *  Run with: npm run icons */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const png = await readFile(new URL('../public/noodle-master.png', import.meta.url));
for (const size of [180,192,512]) {
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0}img{display:block;width:100vw;height:100vh}</style><img src="data:image/png;base64,${png.toString('base64')}"/>`);
  await page.locator('img').evaluate(image => image.decode());
  await page.screenshot({path:new URL(`../public/noodle-shadow-${size}.png`,import.meta.url).pathname});
}
await browser.close();
