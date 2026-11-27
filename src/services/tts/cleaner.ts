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
