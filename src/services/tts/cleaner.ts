export function isBengaliText(text: string): boolean {
  if (!text) return false;
  if (/[\u0980-\u09FF]/.test(text)) return true;
  const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
  return nonAscii / text.length > 0.4;
}

export function resolveTtsLanguage(
  text: string,
  isEnglishOption?: boolean
): { isEnglish: boolean; isBengali: boolean; languageCode: 'en' | 'bn' } {
  const isBengali = isBengaliText(text);
  const isEnglish = !isBengali && (isEnglishOption !== undefined ? isEnglishOption : true);
  return {
    isEnglish,
    isBengali,
    languageCode: isEnglish ? 'en' : 'bn',
  };
}

const KNOWN_OUTLET_RE =
  /\b(?:The New York Times|New York Times|Reviews by Wirecutter|Wirecutter|CNN|NBC News|Fox News|ABC News|CBS News|BBC News|BBC|Reuters|Associated Press|AP News|Yahoo Finance|Yahoo|CNBC|Forbes|Bloomberg|The Verge|Engadget|TechCrunch|Mashable|The Washington Post|Washington Post|USA TODAY|The Wall Street Journal|Wall Street Journal|Google News|ScienceAlert|Business Insider|Al Jazeera|The Guardian|Sky News|Daily Mail|NDTV|Hindustan Times|Times of India|Prothom Alo|The Daily Star)\b/gi;

/**
 * Strips third-party aggregator suffixes ("| Reviews by Wirecutter", "- CNN") from headlines
 * for clean on-screen typography and compliant narration.
 */
export function cleanHeadlineForDisplay(headline?: string): string {
  const raw = (headline || '').trim();
  if (!raw) return '';

  let cleaned = raw
    .replace(/\u00a0+/g, ' ')
    .replace(/\s*\|\s*[^|]{2,45}$/g, (m) => (KNOWN_OUTLET_RE.test(m) || /review|wirecutter|news/i.test(m) ? '' : m))
    .replace(/\s+[-–—]\s*(?:The New York Times|New York Times|CNN|NBC News|BBC News|Reuters|Forbes|CNBC|The Verge|Mashable|ScienceAlert|Yahoo Finance|Google News|Bloomberg)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  KNOWN_OUTLET_RE.lastIndex = 0;
  return cleaned || raw;
}

/**
 * Splits glued Google-News aggregator text (`Headline\u00a0\u00a0PublisherNextHeadline`),
 * strips third-party publisher names, fixes spacing after punctuation, and drops
 * incomplete trailing clauses cut off by RSS feeds (e.g. "— shop Ugg, Apple").
 */
export function sanitizeAggregatorText(rawText: string): string {
  if (!rawText) return '';

  const nbspSegments = rawText
    .replace(/See more headlines & perspectives on Google News/gi, '')
    .replace(/\s*[-–|]?\s*Read the latest breaking report on[^.!\n]*[.!\n]?/gi, '')
    .split(/\u00a0{2,}/)
    .map((part) => part.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);

  const cleanedParts: string[] = [];
  for (let i = 0; i < nbspSegments.length; i++) {
    let seg = nbspSegments[i];
    if (i > 0) {
      seg = seg.replace(
        /^(?:The New York Times|New York Times|Reviews by Wirecutter|Wirecutter|CNN|NBC News|Fox News|ABC News|CBS News|BBC News|BBC|Reuters|Associated Press|Yahoo Finance|Yahoo|CNBC|Forbes|Bloomberg|The Verge|Engadget|TechCrunch|Mashable|The Washington Post|Washington Post|USA TODAY|The Wall Street Journal|Google News|ScienceAlert|Business Insider)\s*/i,
        ''
      );
    }
    seg = seg
      .replace(/\s*\|\s*Reviews by Wirecutter\b/gi, '')
      .replace(KNOWN_OUTLET_RE, '')
      .replace(/([.!?])([A-Za-z0-9])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();

    if (seg.length >= 12) {
      cleanedParts.push(seg);
    }
  }

  let joined = cleanedParts.join('. ');
  joined = joined
    .replace(/\.\s*\./g, '.')
    .replace(/([.!?])([A-Za-z0-9])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  return dropTruncatedTrailingFragment(joined);
}

/**
 * Drops unfinished mid-sentence fragments left by RSS feed character truncation
 * (e.g. trailing "... — shop Ugg, Apple" or "... bags, Sh").
 */
function dropTruncatedTrailingFragment(text: string): string {
  const sentences = text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return text.replace(/[\s,–—-]+$/, '').trim();
  }

  const complete = sentences.filter((s, idx) => {
    if (idx < sentences.length - 1) return true;
    return /[.!?।]$/.test(s);
  });

  return (complete.length > 0 ? complete : sentences.slice(0, 1)).join(' ').trim();
}

/**
 * Trims commentary at a complete sentence boundary (`maxChars`), avoiding mid-word cutoffs.
 */
export function trimToCompleteSentences(text: string, maxChars: number): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length <= maxChars) return clean;

  const sentences = clean.split(/(?<=[.!?।])\s+/).filter(Boolean);
  let out = '';
  for (const s of sentences) {
    const candidate = out ? `${out} ${s}` : s;
    if (candidate.length > maxChars) break;
    out = candidate;
  }

  if (out.length >= 40) return out;
  const fallbackCut = clean.slice(0, maxChars).replace(/\s+\S*$/, '').trim();
  return /[.!?।]$/.test(fallbackCut) ? fallbackCut : `${fallbackCut}.`;
}

const BANGLA_DIGIT_MAP: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

const BANGLA_0_TO_99: string[] = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বায়ান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
];

function banglaDigitsToAscii(input: string): string {
  return input.replace(/[০-৯]/g, (d) => BANGLA_DIGIT_MAP[d] ?? d);
}

/**
 * Converts a non-negative integer into natural spoken Bengali words
 * using standard South Asian grouping (শো, হাজার, লাখ, কোটি).
 */
export function integerToBanglaWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  const intVal = Math.floor(n);
  if (intVal < 100) return BANGLA_0_TO_99[intVal];

  if (intVal >= 1900 && intVal <= 1999) {
    const rem = intVal - 1900;
    return rem === 0 ? 'উনিশশো' : `উনিশশো ${BANGLA_0_TO_99[rem]}`;
  }
  if (intVal >= 2000 && intVal <= 2099) {
    const rem = intVal - 2000;
    return rem === 0 ? 'দুই হাজার' : `দুই হাজার ${BANGLA_0_TO_99[rem]}`;
  }

  const parts: string[] = [];
  let rem = intVal;

  const crore = Math.floor(rem / 10000000);
  if (crore > 0) {
    parts.push(`${integerToBanglaWords(crore)} কোটি`);
    rem %= 10000000;
  }

  const lakh = Math.floor(rem / 100000);
  if (lakh > 0) {
    parts.push(`${BANGLA_0_TO_99[lakh]} লাখ`);
    rem %= 100000;
  }

  const thousand = Math.floor(rem / 1000);
  if (thousand > 0) {
    parts.push(`${BANGLA_0_TO_99[thousand]} হাজার`);
    rem %= 1000;
  }

  const hundred = Math.floor(rem / 100);
  if (hundred > 0) {
    parts.push(`${BANGLA_0_TO_99[hundred]}শো`);
    rem %= 100;
  }

  if (rem > 0) {
    parts.push(BANGLA_0_TO_99[rem]);
  }

  return parts.join(' ').trim();
}

function convertNumberTokenToBanglaWords(rawToken: string): string {
  const ascii = banglaDigitsToAscii(rawToken).replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(ascii)) return rawToken;

  const [intPart, decPart] = ascii.split('.');
  const intNum = Number(intPart);
  if (!Number.isSafeInteger(intNum) || intNum > 999999999999) {
    return ascii.split('').map((d) => BANGLA_0_TO_99[Number(d)] ?? d).join(' ');
  }

  const intWords = integerToBanglaWords(intNum);
  if (!decPart) return intWords;

  const decWords = decPart
    .split('')
    .map((d) => BANGLA_0_TO_99[Number(d)] ?? d)
    .join(' ');
  return `${intWords} দশমিক ${decWords}`;
}

/**
 * Formats narration text specifically for TTS synthesis so Bengali voices pronounce numbers
 * fluently in spoken words (e.g. `৪৫২` -> `চারশো বায়ান্ন`) instead of stumbling over digits.
 */
export function formatScriptForTts(text: string, isEnglish: boolean): string {
  const clean = (text || '').trim();
  if (!clean) return clean;
  if (isEnglish && !isBengaliText(clean)) return clean;

  return clean
    .replace(/([০-৯0-9]+)\s*[-–—]\s*([০-৯0-9]+)/g, (_, a, b) => {
      return `${convertNumberTokenToBanglaWords(a)} থেকে ${convertNumberTokenToBanglaWords(b)}`;
    })
    .replace(/(?:২৪\/৭|24\/7)/g, 'চব্বিশ ঘণ্টা')
    .replace(/([০-৯0-9][০-৯0-9,]*(?:\.[০-৯0-9]+)?)\s*%/g, (_, num) => {
      return `${convertNumberTokenToBanglaWords(num)} শতাংশ `;
    })
    .replace(/([০-৯0-9][০-৯0-9,]*(?:\.[০-৯0-9]+)?)/g, (match) => {
      return ` ${convertNumberTokenToBanglaWords(match)} `;
    })
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+([।,.!?])/g, '$1')
    .trim();
}

export function cleanSpeechScript(description?: string, headline?: string): string {
  const raw = (description || '').trim();
  const fallbackHeadline = cleanHeadlineForDisplay(headline);

  let clean = raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  clean = clean
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&zwnj;|&zwj;/gi, '');

  clean = clean
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\((?:ছবি|ফাইল ছবি|সংগৃহীত|প্রতিনিধি|ছবি:)[^)]*\)/gi, '')
    .replace(/\((?:Photo|File Photo|Reuters|AFP|AP|Source)[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(?:Full\s+story\s+in\s+(?:the\s+)?(?:first\s+)?comments?|Link\s+in\s+comments?|Check\s+(?:the\s+)?comments?)\b[.!?]*/gi, '')
    .replace(/বিস্তারিত\s*(?:পড়ুন|জানুন|দেখুন)?\s*কমেন্টে(?:\s*দে(?:য়া|ওয়া)\s*লিংকে)?[।.!?]*/g, '');

  clean = sanitizeAggregatorText(clean);

  if (!clean || clean.length < 3 || !/[\p{L}\p{N}]/u.test(clean)) {
    return fallbackHeadline;
  }

  return clean;
}

/**
 * Removes an exact repeated headline prefix from cleaned RSS descriptions so editorial
 * enrichment can detect thin snippet-only feeds.
 */
export function stripRepeatedHeadlinePrefix(cleanBody: string, headline: string): string {
  const normBody = cleanBody.trim();
  const normHead = (headline || '').trim();
  if (!normBody || !normHead) return normBody;

  const normalizeForCmp = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  const cmpHead = normalizeForCmp(normHead);
  const cmpBody = normalizeForCmp(normBody);
  if (cmpBody === cmpHead) return '';

  if (normBody.toLowerCase().startsWith(normHead.toLowerCase())) {
    const remainder = normBody.slice(normHead.length).replace(/^[\s\-–:|—,.!?।]+/, '').trim();
    return remainder;
  }
  return normBody;
}
