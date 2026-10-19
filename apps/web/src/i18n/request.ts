import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import en from "../messages/en.json";
import zhCN from "../messages/zh-CN.json";
import zhTW from "../messages/zh-TW.json";
import { routing } from "./routing";

/**
 * The English catalog is the type of truth for the message shape.
 *
 * Because `zh-CN.json` and `zh-TW.json` are declared as `Messages`, TypeScript
 * fails the build on a **missing** key in either translation. Extra keys are not
 * caught here (an imported JSON object is not a fresh literal, so excess-property
 * checking does not apply) — `scripts/check-i18n-parity.mjs` is what fails CI on
 * an orphan key. Between the two, parity is enforced in both directions.
 */
export type Messages = typeof en;

const CATALOGS: Record<(typeof routing.locales)[number], Messages> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: CATALOGS[locale] };
});