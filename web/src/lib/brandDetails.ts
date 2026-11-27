/** Who a brand is (`brand_details` on the server): personal data, apart from the brand's look. */
export interface BrandDetails {
  kind: "" | "company" | "individual";
  legalName: string; line1: string; line2: string; city: string; region: string; postalCode: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  mobile: string; email: string;
}

export const EMPTY_DETAILS: BrandDetails = { kind: "", legalName: "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "", mobile: "", email: "" };

export const KIND_LABEL: Record<Exclude<BrandDetails["kind"], "">, string> = { company: "Company", individual: "Individual" };

export const sameDetails = (a: BrandDetails, b: BrandDetails) => (Object.keys(EMPTY_DETAILS) as (keyof BrandDetails)[]).every((k) => a[k] === b[k]);

/** What is wrong with what was typed, as the server would say it; undefined when it can be saved. */
export function detailsProblem(d: BrandDetails): string | undefined {
  const email = d.email.trim(), mobile = d.mobile.trim();
  if (email && !/^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/.test(email)) return "That is not an email address.";
  if (mobile && !/^\+?[0-9][0-9 ()./-]{2,29}$/.test(mobile)) return "The mobile number holds digits, spaces and + ( ) . / - only.";
  return undefined;
}

// ISO 3166-1 alpha-2, as assigned
const CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";

export interface Country { code: string; name: string }

/** Every country with its name in the given language, by name. */
export function countries(locale = "en"): Country[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return CODES.split(" ").map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, locale));
}
