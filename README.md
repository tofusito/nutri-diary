# Nutri Diary

A small, multi-profile nutrition diary in Spanish. Mobile-first React PWA, Express API, one MongoDB instance with separate catalog and tracking databases. No adaptive coaching or subscription service.

## Product scope

- Several profiles share one installation and one food catalog, each with its own name, weight, height, age, sex, weekly exercise level, goals, goal history and diary. The profile is chosen once after signing in and is remembered per device; it is not switched from inside the diary, only from "Cambiar de perfil" in the profile tab.
- A dish cooked for the household can be logged in more than one diary at once: ticking another profile in the add sheet reveals its own gram field, so two people can record different helpings of the same food on the same day and meal.
- Set carbohydrates, protein and fat in grams. Goal energy is always `4 × carbs + 4 × protein + 9 × fat`.
- Carbohydrates, protein and fat keep one colour each across every screen — amber, blue and pink — so a figure can be read without hunting for its label.
- The home screen shows one day at a time. Totals sit at the top: consumed over goal, and underneath the difference — `−N` in green while something is still available, `+N` in red once the goal is passed. Missing data reads `—`, never zero.
- Meals are named, not timed: Desayuno, Comida, Merienda, Cena and Snacks. Each has its own add button.
- Adding a food searches the personal catalog first and Open Food Facts second, in that order, in one list. Barcodes can be scanned or typed. A barcode is not a unique key in practice — retailers reuse them — so every product matching it is listed, personal entries first, and the personal catalog allows several foods to share one code.
- When a barcode is nowhere to be found, the create form opens with that code already filled in and asks for the bare minimum: name, barcode and kcal, carbohydrates, protein and fat per 100 g/ml. Brand, usual portion, favorite, label OCR and the private QR sit behind "Más opciones". Blank fields are stored as unknown, not as zero.
- Picking an external result copies it into the personal catalog, so the next search finds it locally. The catalog is one shared library: a food created from any profile is immediately searchable from the others.
- Quantities are entered in grams or millilitres and every value is scaled from the per-100 figures. The add sheet shows the scaled kcal and macros for the amount typed before confirming, and each meal on the home screen lists what was eaten, with its own kcal and macro line.
- Progress only charts days that actually have entries; empty days are dropped rather than drawn as zeroes, and a range with no records says so.
- Optional Mifflin–St Jeor calculator estimates resting energy; an activity multiplier estimates maintenance separately. It does not change targets automatically. This equation dates from 1990; it is not a newly released or adaptive algorithm.
- Food labels retain their declared kcal. Fiber, alcohol and rounding mean food energy need not equal a naive 4/4/9 calculation. The 4/4/9 rule is authoritative for the user's macro goal only.

## Development

Node 22.23+ and a MongoDB instance are required. Install dependencies with `npm ci`. Copy `.env.example` to a private `.env`, set `MONGODB_URI`, and either set `APP_PASSWORD` or explicitly opt into `DEV_AUTH_BYPASS=1` for loopback-only development. Start `npm run server` and `npm run dev` in separate terminals. Vite proxies `/api` to port 3100. Production assets use `npm run build`, then `npm start`.

`npm test` runs arithmetic and API tests. API integration tests use a temporary real MongoDB process via mongodb-memory-server; the first run downloads its binary. `node scripts/generate-icons.mjs` regenerates PNG assets from the SVG with Playwright; requires `npx playwright install chromium`.

## Hosting behind Cloudflare Tunnel

`compose.yaml` prepares app + MongoDB with a persistent named volume. Set a strong `APP_PASSWORD` and the actual public HTTPS `APP_ORIGIN` in `.env` before running `docker compose up -d --build`. The default app binding is `127.0.0.1:3100`; MongoDB has no published port.

This deployment is published at `https://nutri.tofusito.org`; set that as `APP_ORIGIN`. Same-origin checks on writes and the secure session cookie both depend on it being the real public origin.

For a host-installed cloudflared, route `nutri.tofusito.org` to `http://127.0.0.1:3100`. To run cloudflared inside compose instead, put the tunnel token in `TUNNEL_TOKEN` and start with `docker compose --profile tunnel up -d --build`; that service targets `http://app:3100`, because localhost inside the cloudflared container would address the wrong container. Creating the tunnel and its DNS record in the Cloudflare dashboard is a manual step this repository does not perform.

Cloudflare Tunnel provides transport, not by itself user authentication. The app has one password-protected personal session; Cloudflare Access may additionally restrict access. If enabling Access, enable token validation at the tunnel/origin as documented by Cloudflare. Keep APIs uncached at the edge; never add a Cache Everything rule to this hostname.

On iPhone, open the HTTPS site and choose Share → Add to Home Screen. On Android use the browser's installation option. Barcode scanning needs camera permission and a secure context: it works on the HTTPS hostname and on localhost, and fails everywhere else, including plain-HTTP access to the LAN address. The scanner says so and offers a field for typing the code by hand. Confirm camera behavior and standalone installation on the actual phone after the tunnel is available.

## Data and providers

`nutrition_catalog`: personal foods and external cache, shared by every profile. `nutrition_tracking`: profiles, goal history and diary entries, each row stamped with its `profileId`. Entries preserve a food snapshot, so editing a catalog item cannot rewrite historical intake. Client UUIDs prevent duplicate creates during network retries.

Startup migrates an older single-profile database: the previous profile becomes `Perfil 1` and existing entries and goals are stamped with its id. Deleting a profile deletes its diary and goal history; the last remaining profile cannot be deleted.

Open Food Facts data are community-maintained and may be incomplete. Unknown values are displayed as missing, not assumed zero. Product searches are explicit and rate limited. Keep attribution in the UI and source metadata in stored foods. Optional `USDA_API_KEY` enables FoodData Central searches; without it, the UI should show a configuration message. US carbohydrate definitions may differ from EU labels: review external results before saving.

Label OCR runs in the browser; language/model assets may download on first use. Photos are not uploaded as diary records. Treat OCR fields as suggestions and confirm them before saving. This is label reading, not calorie estimation from meal photographs.

## Backups

JSON export is a portable record of the application data, not an automated backup policy. Before operational use, configure scheduled MongoDB dumps of both databases into protected storage and test restoration into a separate instance. Do not run destructive volume cleanup commands on the production stack. No production deployment or backup restoration is performed by the development tests.

## Sources

- [Open Food Facts API](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/) and [licensing](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/).
- [FoodData Central API](https://fdc.nal.usda.gov/api-guide/).
- [Mifflin et al., original equation](https://www.carnotdiet.com/Files/BMRMifflin1990.pdf).
- [PWA installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [ZXing browser](https://github.com/zxing-js/browser), [Tesseract.js](https://github.com/naptha/tesseract.js).
- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/) and [protecting self-hosted apps](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).
- [Vite](https://vite.dev/guide/), [Express](https://expressjs.com/en/starter/basic-routing/), [MongoDB Node driver](https://www.mongodb.com/docs/drivers/node/current/get-started/).
