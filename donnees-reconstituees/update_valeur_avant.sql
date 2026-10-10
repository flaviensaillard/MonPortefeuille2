-- Mise à jour des valeurs « avant apport » (pf2_apports).
-- NE PAS EXÉCUTER sans validation écrite du propriétaire (CSV + RAPPORT.md).
-- Ne touche qu'aux colonnes valeur_avant_eur / valeur_avant_usd des ids listés,
-- uniquement si elles sont encore NULL (garde IS NULL). Aucune suppression.
BEGIN;
UPDATE pf2_apports SET valeur_avant_eur = 31251.30, valeur_avant_usd = 33964.01 WHERE id = 268 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 48929.02, valeur_avant_usd = 53012.00 WHERE id = 269 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 49010.54, valeur_avant_usd = 53151.01 WHERE id = 270 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 49010.54, valeur_avant_usd = 53151.01 WHERE id = 271 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 49010.54, valeur_avant_usd = 53151.01 WHERE id = 272 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 50653.70, valeur_avant_usd = 54678.00 WHERE id = 273 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 50653.70, valeur_avant_usd = 54678.00 WHERE id = 305 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 50831.02, valeur_avant_usd = 54469.00 WHERE id = 274 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 50831.02, valeur_avant_usd = 54469.00 WHERE id = 275 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 50831.02, valeur_avant_usd = 54469.00 WHERE id = 276 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 59091.90, valeur_avant_usd = 63830.00 WHERE id = 277 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 60386.76, valeur_avant_usd = 64665.00 WHERE id = 278 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 60386.76, valeur_avant_usd = 64665.00 WHERE id = 279 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 70826.97, valeur_avant_usd = 76631.00 WHERE id = 280 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 69282.35, valeur_avant_usd = 76767.99 WHERE id = 281 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 71635.92, valeur_avant_usd = 80016.00 WHERE id = 282 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 74648.10, valeur_avant_usd = 80774.00 WHERE id = 283 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 74648.10, valeur_avant_usd = 80774.00 WHERE id = 284 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 76569.09, valeur_avant_usd = 80880.00 WHERE id = 285 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 77354.57, valeur_avant_usd = 80676.00 WHERE id = 286 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 78674.40, valeur_avant_usd = 82020.00 WHERE id = 287 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 78569.56, valeur_avant_usd = 84863.00 WHERE id = 288 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 78569.56, valeur_avant_usd = 84863.00 WHERE id = 289 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 77153.36, valeur_avant_usd = 87788.00 WHERE id = 290 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 76940.89, valeur_avant_usd = 88874.00 WHERE id = 291 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 79354.98, valeur_avant_usd = 92699.00 WHERE id = 292 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 81988.21, valeur_avant_usd = 96184.00 WHERE id = 293 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 81846.85, valeur_avant_usd = 94717.00 WHERE id = 294 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 81591.56, valeur_avant_usd = 94645.00 WHERE id = 295 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 80370.86, valeur_avant_usd = 94414.00 WHERE id = 296 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 83624.65, valeur_avant_usd = 100063.00 WHERE id = 297 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 83624.65, valeur_avant_usd = 100063.00 WHERE id = 298 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 86177.01, valeur_avant_usd = 101714.99 WHERE id = 299 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 87871.69, valeur_avant_usd = 100700.99 WHERE id = 300 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 84781.87, valeur_avant_usd = 98426.77 WHERE id = 301 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 80938.92, valeur_avant_usd = 92448.79 WHERE id = 302 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 79064.56, valeur_avant_usd = 90982.34 WHERE id = 303 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 80154.21, valeur_avant_usd = 93430.71 WHERE id = 304 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 81904.31, valeur_avant_usd = 92774.72 WHERE id = 306 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 81013.35, valeur_avant_usd = 91176.83 WHERE id = 307 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
UPDATE pf2_apports SET valeur_avant_eur = 81013.35, valeur_avant_usd = 91176.83 WHERE id = 308 AND valeur_avant_eur IS NULL AND valeur_avant_usd IS NULL;
-- Nombre de lignes concernées : 41
COMMIT;
