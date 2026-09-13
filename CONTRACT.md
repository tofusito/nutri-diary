# Implementation contract

Single personal profile. English code/docs, Spanish UI. No adaptive calorie algorithm.

Shared module `shared/nutrition.js` exports `macroCalories({carbs,protein,fat})`, `scaleNutrients(nutrients,quantity)` (per 100 g/ml), `sumNutrients(array)`, `estimateEnergy({weight,height,age,sex,activity})` -> {resting,maintenance}, `localDate(date = new Date())`, `validDate(string)`.

Food shape: `{id,name,brand,barcode,basis:'g'|'ml',nutrients:{kcal,carbs,protein,fat},servingSize?,favorite?,source?,sourceId?,recipe?}`. Nutrients per 100 g/ml; unknowns nullable. Recipe optional metadata. IDs are strings UUIDs, not ObjectIds. Entries `{id,date:'YYYY-MM-DD',meal:'Desayuno'|'Comida'|'Cena'|'Snacks',food:Food,quantity:number}`. Server validates/recomputes `totals`, stores food snapshot. PATCH /entries/:id supports quantity, meal, date. POST uses client UUID id for idempotency. DELETE idempotent.

Profile `{carbs,protein,fat,weight?,height?,age?,sex:'male'|'female',activity:1.2|1.375|1.55|1.725|1.9}`. kcal derived 4C+4P+9F. Default zero macros; setup prompt. Profile changes include optional effectiveDate, server uses current local date if absent. Goal history is server concern.

JSON endpoints: GET/PUT /api/profile -> Profile; GET /api/foods?q= -> Food[] (local only); POST /api/foods -> Food; PATCH /api/foods/:id -> Food; GET /api/lookup/:barcode -> Food or 404; GET /api/search?provider=off|usda&q= -> Food[]; GET /api/entries?date= -> Entry[]; POST /api/entries -> Entry; PATCH /api/entries/:id -> Entry; DELETE -> {ok:true}; GET /api/progress?from=&to= -> [{date,kcal,carbs,protein,fat,count,goal:{kcal,carbs,protein,fat}}]; GET /api/export -> {profile,foods,entries,goals}; GET /api/health -> {ok:true}. Errors {error:Spanish message}. API private gated by optional APP_PASSWORD, POST /api/login {password}, GET /api/session -> {authenticated:boolean}, POST /api/logout. In local dev no password permitted only with DEV_AUTH_BYPASS=1; production fail closed if no APP_PASSWORD. Session cookies HttpOnly. Cloudflare Tunnel routing later, no infrastructure changes now.

Frontend owns src/ files; backend owns server/ files. Parent owns shared/, tests/, PWA public/, scaffolding, Docker/docs and integration. Do not overwrite others' files. Use apply_patch. Keep scope simple. Build a working implementation, not mockups.
