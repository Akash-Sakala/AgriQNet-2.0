// Pest names in the farmer's language, bundled with the app (shared with the API's SMS texts),
// so switching language never waits for the network.
import { Language } from '../types';
import en from '@shared-i18n/pests.en.json';
import hi from '@shared-i18n/pests.hi.json';
import kn from '@shared-i18n/pests.kn.json';
import te from '@shared-i18n/pests.te.json';

const lower = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
const B: Record<Language, Record<string, string>> = { en: lower(en), hi: lower(hi), kn: lower(kn), te: lower(te) };
const get = (lang: Language, key: string) => B[lang]?.[key.toLowerCase()] ?? B.en[key.toLowerCase()];

/** "brown plant hopper" -> "ಕಂದು ಜಿಗಿ ಹುಳು" */
export const pestLabel = (lang: Language, english: string) => get(lang, `pest_${english}`) || english;
/** Host crop group ("Rice", "Corn / Maize") in the farmer's language */
export const cropGroupLabel = (lang: Language, group?: string) => (group ? get(lang, `crop_${group}`) || group : '');
/** Standard IPM tips for a crop group */
export const pestTips = (lang: Language, group: string | undefined, englishTips: string[] = []) =>
  englishTips.map((tip, i) => (group && get(lang, `mgmt_${group}_${i}`)) || tip);
