# Nutri Diary

A small, single-profile nutrition diary in Spanish. Mobile-first React PWA, Express API, one MongoDB instance with separate catalog and tracking databases. No adaptive coaching or subscription service.

## Product scope

- Set carbohydrates, protein and fat in grams. Goal energy is always `4 × carbs + 4 × protein + 9 × fat`.
- Log foods for today, yesterday or any calendar date. Edit quantities, repeat meals and inspect daily totals.
- Scan supermarket barcodes; search Open Food Facts; create personal foods when missing. Favorites, portions, recipes, personal QR codes and reviewed label OCR.
- Optional Mifflin–St Jeor calculator estimates resting energy; an activity multiplier estimates maintenance separately. It does not change targets automatically. This equation dates from 1990; it is not a newly released or adaptive algorithm.
- Food labels retain their declared kcal. Fiber, alcohol and rounding mean food energy need not equal a naive 4/4/9 calculation. The 4/4/9 rule is authoritative for the user's macro goal only.

## Development

Node 22.23+ and a MongoDB instance are required. Install dependencies with `npm ci`. Copy `.env.example` to a private `.env`, set `MONGODB_URI`, and either set `APP_PASSWORD` or explicitly opt into `DEV_AUTH_BYPASS=1` for loopback-only development. Start `npm run server` and `npm run dev` in separate terminals. Vite proxies `/api` to port 3100. Production assets use `npm run build`, then `npm start`.

`npm test` runs arithmetic and API tests. API integration tests use a temporary real MongoDB process via mongodb-memory-server; the first run downloads its binary. `node scripts/generate-icons.mjs` regenerates PNG assets from the SVG with Playwright; requires `npx playwright install chromium`.

## Hosting behind Cloudflare Tunnel

`compose.yaml` prepares app + MongoDB with a persistent named volume. Set a strong `APP_PASSWORD` and the actual public HTTPS `APP_ORIGIN` in `.env` before running `docker compose up -d --build`. The default app binding is `127.0.0.1:3100`; MongoDB has no published port.

For a host-installed cloudflared, route the chosen public hostname to `http://127.0.0.1:3100`. For containerized cloudflared, attach it to the app network and use `http://app:3100` instead; localhost inside cloudflared would address the wrong container. The actual hostname, tunnel and network are deliberately not invented or modified by this repository.

Cloudflare Tunnel provides transport, not by itself user authentication. The app has one password-protected personal session; Cloudflare Access may additionally restrict access. If enabling Access, enable token validation at the tunnel/origin as documented by Cloudflare. Keep APIs uncached at the edge; never add a Cache Everything rule to this hostname.

On iPhone, open the HTTPS site and choose Share → Add to Home Screen. On Android use the browser's installation option. Camera scanning requires permission and HTTPS outside localhost. Confirm camera behavior and standalone installation on the actual phone after the tunnel is available.

## Data and providers

`nutrition_catalog`: personal foods and external cache. `nutrition_tracking`: profile, goal history and diary entries. Entries preserve a food snapshot, so editing a catalog item cannot rewrite historical intake. Client UUIDs prevent duplicate creates during network retries.

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
