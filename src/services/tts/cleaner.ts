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

export function cleanSpeechScript(description?: string, headline?: string): string {
  const raw = (description || '').trim();
  const fallbackHeadline = (headline || '').trim();

  let clean = raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  clean = clean
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&zwnj;|&zwj;/gi, '');

  clean = clean
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\((?:ছবি|ফাইল ছবি|সংগৃহীত|প্রতিনিধি|ছবি:)[^)]*\)/gi, '')
    .replace(/\((?:Photo|File Photo|Reuters|AFP|AP|Source)[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s*[-–|]?\s*Read the latest breaking report on[^.!\n]*[.!\n]?/gi, '')
    .replace(/\b(?:Full\s+story\s+in\s+(?:the\s+)?(?:first\s+)?comments?|Link\s+in\s+comments?|Check\s+(?:the\s+)?comments?)\b[.!?]*/gi, '')
    .replace(/বিস্তারিত\s*(?:পড়ুন|জানুন|দেখুন)?\s*কমেন্টে(?:\s*দে(?:য়া|ওয়া)\s*লিংকে)?[।.!?]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

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
