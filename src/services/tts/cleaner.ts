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
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length < 3 || !/[\p{L}\p{N}]/u.test(clean)) {
    return fallbackHeadline;
  }

  return clean;
}
