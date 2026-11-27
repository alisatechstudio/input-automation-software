import { config } from '../../config/env.js';
import { resolveCategoryTheme } from '../../config/constants.js';
import { PixabayVideoService } from '../media/pixabay.js';
import {
  cleanHeadlineForDisplay,
  cleanSpeechScript,
  isBengaliText,
  stripRepeatedHeadlinePrefix,
  trimToCompleteSentences,
} from '../tts/cleaner.js';
import { isLlmEndpointConfigured, resolveLlmEndpoint } from './client.js';

export interface StoryMetric {
  label: string;
  value: string;
  numericValue?: number;
}

export interface StorySubject {
  name: string;
  role: string;
}

export interface ReelScriptRewriteResult {
  spokenScript: string;
  brollQuery: string;
  brollQueries: string[];
  keyPoints: string[];
  metrics: StoryMetric[];
  subjects: StorySubject[];
  rewrittenByLlm: boolean;
}

const EDITORIAL_CONTEXT_NOTES: Record<string, { en: string; bn: string }> = {
  'cat-politics': {
    en: 'Analysts note this development signals shifting coalition dynamics and potential policy adjustments ahead.',
    bn: 'বিশ্লেষকদের মতে, এই ঘটনাপ্রবাহ আগামী দিনের রাজনৈতিক সমীকরণ ও নীতিনির্ধারণে গুরুত্বপূর্ণ প্রভাব ফেলতে পারে।',
  },
  'cat-economy': {
    en: 'Market observers are watching closely how supply chains, pricing, and investor confidence respond in the coming days.',
    bn: 'বাজার বিশ্লেষকদের নজর এখন সরবরাহ চেইন, দ্রব্যমূল্য ও ব্যবসা-বাণিজ্যে এর দীর্ঘমেয়াদি প্রভাবের দিকে।',
  },
  'cat-international': {
    en: 'This update carries wider regional consequences, highlighting how cross-border policy decisions affect everyday communities.',
    bn: 'আন্তর্জাতিক বিশ্লেষণে দেখা যাচ্ছে, এই পদক্ষেপের কূটনৈতিক ও আঞ্চলিক প্রভাব দীর্ঘস্থায়ী হতে পারে।',
  },
  'cat-sports': {
    en: 'The milestone underscores tactical resilience under pressure and raises expectations heading into upcoming fixtures.',
    bn: 'ম্যাচের এই পারফরম্যান্স দলের কৌশলগত দৃঢ়তা তুলে ধরেছে, যা সামনের সূচিতে বাড়তি আত্মবিশ্বাস জোগাবে।',
  },
  'cat-technology': {
    en: 'Experts note that new research and rapid technological shifts are reshaping long-held assumptions across the field.',
    bn: 'বিশেষজ্ঞদের মতে, নতুন গবেষণা ও প্রযুক্তির দ্রুত প্রসার এই খাতে গুরুত্বপূর্ণ পরিবর্তন আনছে।',
  },
  'cat-lifestyle': {
    en: 'Health and lifestyle researchers emphasize that everyday habits and informed awareness directly shape long-term well-being.',
    bn: 'বিশেষজ্ঞরা মনে করেন, দৈনন্দিন অভ্যাস ও সচেতনতা দীর্ঘমেয়াদে আমাদের জীবনযাত্রায় সরাসরি প্রভাব ফেলে।',
  },
  'cat-entertainment': {
    en: 'The project highlights how creative leadership and audience word-of-mouth can drive unexpected commercial momentum.',
    bn: 'সুনির্দিষ্ট পরিকল্পনা ও দর্শকদের ইতিবাচক সাড়াই এই অভাবনীয় সাফল্যের পেছনে মূল চালিকাশক্তি হিসেবে কাজ করেছে।',
  },
  'cat-bangladesh': {
    en: 'Local stakeholders emphasize coordinated action and public accountability as follow-up steps take shape.',
    bn: 'সংশ্লিষ্ট মহলের মতে, বাস্তবসম্মত পদক্ষেপ ও স্বচ্ছ সমন্বয় নিশ্চিত করাই এখন মূল অগ্রাধিকার।',
  },
};

const TOPIC_EDITORIAL_NOTES: Array<{ pattern: RegExp; en: string; bn: string }> = [
  {
    pattern: /black friday|cyber monday|deals?|discount|walmart|amazon|shopping|sale/i,
    en: 'Consumer analysts note that major retailers now spread seasonal markdowns across staggered waves, making it worthwhile to compare baseline price history before buying.',
    bn: 'বাজার বিশ্লেষকদের মতে, বড় বিক্রেতারা এখন ধাপে ধাপে ছাড় দেয়, তাই কেনাকাটার আগে পণ্যের পূর্বের দাম যাচাই করে নেওয়া বুদ্ধিমানের কাজ।',
  },
  {
    pattern: /study|research|scientist|genetic|biology|discovery|গবেষণা|বিজ্ঞান/i,
    en: 'Researchers emphasize that new empirical evidence continues to refine how we understand long-term natural and historical patterns.',
    bn: 'গবেষকদের মতে, নতুন তথ্য-উপাত্ত প্রচলিত ধারণাকে আরও স্পষ্ট ও গভীরভাবে বুঝতে সাহায্য করছে।',
  },
  {
    pattern: /storm|flood|outage|power|weather|climate|ঝড়|বন্যা|বিদ্যুৎ|আবহাওয়া/i,
    en: 'Emergency crews and infrastructure planners stress grid resilience and rapid coordination as recovery continues.',
    bn: 'বিশেষজ্ঞদের মতে, জরুরি সমন্বয় ও অবকাঠামোগত প্রস্তুতি জোরদার করাই এখন সবচেয়ে জরুরি।',
  },
  {
    pattern: /court|legal|law|arrest|আদালত|আইন|গ্রেপ্তার|বিচার/i,
    en: 'Legal observers highlight how the upcoming proceedings could set a meaningful precedent for institutional accountability.',
    bn: 'আইন বিশ্লেষকদের মতে, এই প্রক্রিয়ার পরবর্তী অগ্রগতি ভবিষ্যতের নজির নির্ধারণে ভূমিকা রাখতে পারে।',
  },
];

/**
 * Uses FreeLLMAPI chat models to turn raw RSS headlines/descriptions into original broadcast narration
 * and concise English Pixabay B-roll search keywords, falling back cleanly to `cleanSpeechScript`.
 */
export class ScriptRewriterService {
  private apiKey: string;
  private baseUrl: string;
  private primaryModel: string;

  constructor() {
    this.apiKey = (config.LLM_API_KEY || '').trim();
    this.baseUrl = (config.LLM_BASE_URL || '').trim();
    this.primaryModel = (config.LLM_CHAT_MODEL || 'mistral-small-3.2-24b').trim();
  }

  public isConfigured(): boolean {
    return config.LLM_SCRIPT_REWRITE && isLlmEndpointConfigured(this.apiKey, this.baseUrl);
  }

  public async rewriteForReel(input: {
    headline: string;
    description?: string;
    category?: string;
    isEnglish: boolean;
  }): Promise<ReelScriptRewriteResult> {
    const fallback = this.buildEditorialFallback(input);

    if (!this.isConfigured() || (!input.headline && !input.description)) {
      return fallback;
    }

    const modelsToTry = process.env.VERCEL
      ? [this.primaryModel].filter(Boolean)
      : Array.from(new Set([this.primaryModel, 'free-router'].filter(Boolean)));
    for (const model of modelsToTry) {
      const outcome = await this.requestRewrite(model, input, fallback);
      if (outcome.result) {
        return outcome.result;
      }
      if (outcome.stopRetrying) {
        break;
      }
    }

    return fallback;
  }

  private parseNumericScale(rawNum: string, unit: string): number {
    const ascii = rawNum
      .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
      .replace(/,/g, '');
    const base = parseFloat(ascii);
    if (!Number.isFinite(base)) return 0;
    const u = (unit || '').toLowerCase();
    if (/কোটি|crore/.test(u)) return base * 10_000_000;
    if (/লাখ|lakh/.test(u)) return base * 100_000;
    if (/হাজার|thousand/.test(u)) return base * 1_000;
    if (/billion/.test(u)) return base * 1_000_000_000;
    if (/million/.test(u)) return base * 1_000_000;
    return base;
  }

  private extractStoryMetrics(headline: string, body: string, isEnglish: boolean): StoryMetric[] {
    const combined = `${headline} ${body}`.trim();
    const metrics: StoryMetric[] = [];
    const seenLabels = new Set<string>();

    const tryPush = (label: string, rawNum: string, unit: string) => {
      const key = label.toLowerCase();
      if (seenLabels.has(key)) return;
      seenLabels.add(key);
      const valText = `${rawNum.trim()}${unit ? ` ${unit.trim()}` : ''}`.trim();
      metrics.push({
        label,
        value: valText,
        numericValue: this.parseNumericScale(rawNum, unit),
      });
    };

    const numUnit = '([০-৯0-9][০-৯0-9.,]*)\\s*(কোটি|লাখ|হাজার|টাকা|ডলার|crore|lakh|million|billion|%)?';
    // Check number-before-keyword first (e.g. "২ কোটি বাজেটে", "৪৫২ কোটির বক্স অফিস"), then keyword-before-number
    const budgetBeforeRe = /([০-৯0-9][০-৯0-9.,]*)\s*(কোটি|লাখ|হাজার|crore|lakh|million|billion)\s*(?:টাকার|ডলারের)?\s*(?:বাজেট|বাজেটে|ব্যয়ে|খরচে|budget|cost)/i;
    const budgetAfterRe = new RegExp(`(?:বাজেট|নির্মাণ ব্যয়|ব্যয়|খরচ|budget|cost)[^০-৯0-9।.]{0,20}${numUnit}`, 'i');
    const revBeforeRe = /([০-৯0-9][০-৯0-9.,]*)\s*(কোটি|লাখ|হাজার|crore|lakh|million|billion)(?:র|ের)?\s*(?:টাকার)?\s*(?:বক্স অফিস|আয়|কালেকশন|box office|gross|revenue)/i;
    const revAfterRe = new RegExp(`(?:বক্স অফিস|আয়|কালেকশন|উপার্জন|বিক্রি|box office|gross|revenue|earning)[^০-৯0-9।.]{0,24}${numUnit}`, 'i');

    const bm = combined.match(budgetBeforeRe) || combined.match(budgetAfterRe);
    if (bm) tryPush(isEnglish ? 'Budget' : 'বাজেট', bm[1], bm[2] || '');

    const rm = combined.match(revBeforeRe) || combined.match(revAfterRe);
    if (rm) tryPush(isEnglish ? 'Box Office' : 'বক্স অফিস আয়', rm[1], rm[2] || '');

    if (metrics.length < 2) {
      const genericNumRe = /([০-৯0-9][০-৯0-9.,]*)\s*(কোটি|লাখ|হাজার|শতাংশ|%|জন|টি|deals|percent|million|billion|crore)/gi;
      let m: RegExpExecArray | null;
      while ((m = genericNumRe.exec(combined)) !== null && metrics.length < 3) {
        const valText = `${m[1]} ${m[2]}`.trim();
        if (metrics.some((x) => x.value === valText)) continue;
        const idx = m.index;
        const snippetBefore = combined.slice(Math.max(0, idx - 32), idx).trim().split(/\s+/).slice(-2).join(' ');
        const label = snippetBefore.replace(/[^\p{L}\p{N}\s-]/gu, '').trim() || (isEnglish ? 'Key Figure' : 'মূল পরিসংখ্যান');
        tryPush(label.slice(0, 22), m[1], m[2]);
      }
    }

    return metrics.slice(0, 3);
  }

  private extractStorySubjects(headline: string, body: string, isEnglish: boolean): StorySubject[] {
    const combined = `${headline}. ${body}`;
    const subjects: StorySubject[] = [];
    const seen = new Set<string>();

    if (!isEnglish) {
      // Match Bangla patterns like "প্রযোজক সুমনা হক" or "সুমনা হক (প্রযোজক)" or "কৌশলবিদ তানিয়া রহমান"
      const roleFirstRe = /(প্রযোজক|সহ-প্রযোজক|পরিচালক|কৌশলবিদ|অভিনেত্রী|অভিনেতা|প্রতিষ্ঠাতা|সিইও|চেয়ারম্যান|মহাসচিব|বিশ্লেষক|গবেষক|উপদেষ্টা|প্রধান|মুখপাত্র)\s+([\u0980-\u09FF]{2,}(?:\s+[\u0980-\u09FF]{2,}){1,2})/g;
      let m: RegExpExecArray | null;
      while ((m = roleFirstRe.exec(combined)) !== null && subjects.length < 3) {
        const role = m[1].trim();
        const name = m[2].replace(/(?:বলেন|জানান|মতে|এর|কে|ও|এবং).*$/, '').trim();
        if (name.length >= 4 && !seen.has(name)) {
          seen.add(name);
          subjects.push({ name, role });
        }
      }
    } else {
      const enRoleRe = /\b(producer|director|strategist|founder|ceo|analyst|chair|president|lead)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/gi;
      let m: RegExpExecArray | null;
      while ((m = enRoleRe.exec(combined)) !== null && subjects.length < 3) {
        const role = m[1].trim();
        const name = m[2].trim();
        if (!seen.has(name)) {
          seen.add(name);
          subjects.push({ name, role });
        }
      }
    }

    return subjects;
  }

  private buildEditorialFallback(input: {
    headline: string;
    description?: string;
    category?: string;
    isEnglish: boolean;
  }): ReelScriptRewriteResult {
    const cleanHead = cleanHeadlineForDisplay(input.headline);
    const cleanDesc = cleanSpeechScript(input.description, cleanHead);
    const bodyOnly = stripRepeatedHeadlinePrefix(cleanDesc, cleanHead);
    const catKey = resolveCategoryTheme(input.category);
    const topicRule = TOPIC_EDITORIAL_NOTES.find((r) =>
      r.pattern.test(`${cleanHead} ${cleanDesc} ${input.category || ''}`)
    );
    const contextNote =
      topicRule || EDITORIAL_CONTEXT_NOTES[catKey] || EDITORIAL_CONTEXT_NOTES['cat-international'];

    const completeSentences = cleanDesc
      .split(/(?<=[.!?।])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 25 && /[.!?।]$/.test(s));

    // When full article paragraphs are available (>= 2 real sentences), deliver actual story details
    // (names, roles, figures) cleanly instead of appending generic filler sentences.
    let spokenScript = '';
    if (completeSentences.length >= 2) {
      spokenScript = completeSentences.slice(0, 4).join(' ').trim();
    } else {
      const baseLead = bodyOnly && bodyOnly.length >= 35 ? `${cleanHead}. ${bodyOnly}` : cleanHead;
      const leadNarrative = /[.!?।]$/.test(baseLead) ? baseLead : `${baseLead}${input.isEnglish ? '.' : '।'}`;
      spokenScript = `${leadNarrative} ${input.isEnglish ? contextNote.en : contextNote.bn}`;
    }

    if (process.env.VERCEL) {
      spokenScript = trimToCompleteSentences(spokenScript, 560);
    } else {
      spokenScript = trimToCompleteSentences(spokenScript, 760);
    }

    const brollQueries = PixabayVideoService.extractTopicVisualQueries(
      `${cleanHead} ${cleanDesc}`,
      input.category
    );

    const keyPoints = this.buildKeyPoints(cleanHead, spokenScript, input.category, input.isEnglish);
    const metrics = this.extractStoryMetrics(cleanHead, cleanDesc, input.isEnglish);
    const subjects = this.extractStorySubjects(cleanHead, cleanDesc, input.isEnglish);

    return {
      spokenScript,
      brollQuery: brollQueries[0] || PixabayVideoService.getCategoryFallbackQuery(input.category),
      brollQueries,
      keyPoints,
      metrics,
      subjects,
      rewrittenByLlm: false,
    };
  }

  private buildKeyPoints(
    headline: string,
    spokenScript: string,
    category?: string,
    isEnglish: boolean = true
  ): string[] {
    const clauses = spokenScript
      .split(/[।.!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 16);

    const trimPoint = (text: string) =>
      text.length > 68 ? `${text.slice(0, 65).replace(/\s+\S*$/, '').trim()}...` : text;

    const points: string[] = [];
    const leadDiffers = clauses[0] && clauses[0].slice(0, 25).toLowerCase() !== headline.slice(0, 25).toLowerCase();
    if (leadDiffers && clauses[0]) points.push(trimPoint(clauses[0]));
    if (clauses[1]) points.push(trimPoint(clauses[1]));
    if (clauses[2]) points.push(trimPoint(clauses[2]));

    if (points.length < 2) {
      points.push(
        isEnglish
          ? `${(category || 'Briefing').toUpperCase()} • Context & Key Takeaways`
          : `${category || 'প্রতিবেদন'} • প্রেক্ষাপট ও মূল প্রভাব বিশ্লেষণ`
      );
    }
    return Array.from(new Set(points)).slice(0, 3);
  }

  private async requestRewrite(
    model: string,
    input: { headline: string; description?: string; category?: string; isEnglish: boolean },
    fallback: ReelScriptRewriteResult
  ): Promise<{ result: ReelScriptRewriteResult | null; stopRetrying?: boolean }> {
    const langInstruction = input.isEnglish
      ? 'Synthesize an ORIGINAL, cohesive editorial commentary in natural English (3-4 complete sentences, 60-85 words). FULFILL THE HEADLINE HOOK DIRECTLY: explicitly name any key people, roles, organizations, or exact numbers from the story rather than ending on vague filler. NEVER mention third-party outlets or claim live broadcast.'
      : 'Synthesize an ORIGINAL, analytical editorial commentary in natural Dhaka Bangla (Bengali script, 3-4 complete sentences, 60-85 words). শিরোনামের প্রতিশ্রুতি সরাসরি পূরণ করুন: নিবন্ধে থাকা ব্যক্তিদের নাম, তাঁদের ভূমিকা (যেমন প্রযোজক/কৌশলবিদ/বিশ্লেষক) ও গুরুত্বপূর্ণ সংখ্যা স্পষ্টভাবে উল্লেখ করুন; ডিজিটাল প্ল্যাটফর্ম বা সাধারণ অনুমানমূলক বুলি দিয়ে শেষ করবেন না।';

    const keyPointInstruction = input.isEnglish
      ? 'keyPoints: array of 2-3 clean concise highlights (5-8 words). metrics: array of up to 3 {"label":"...","value":"..."} comparing key numbers (e.g. Budget vs Box Office). subjects: array of up to 3 {"name":"...","role":"..."} for key individuals named in the story.'
      : 'keyPoints: array of 2-3 concise Bengali highlights. metrics: up to 3 {"label":"...","value":"..."} (যেমন {"label":"বাজেট","value":"২ কোটি"}, {"label":"বক্স অফিস","value":"৪৫২ কোটি"}). subjects: up to 3 {"name":"...","role":"..."} naming key individuals & roles.';

    const systemPrompt = [
      'You are an editorial video scriptwriter producing factual, original commentary reports.',
      'Return ONLY valid JSON: {"spokenScript":"...","brollQueries":["...","...","..."],"keyPoints":["..."],"metrics":[{"label":"...","value":"..."}],"subjects":[{"name":"...","role":"..."}]}.',
      langInstruction,
      keyPointInstruction,
      'brollQueries MUST be 3-4 concise 2-4 word English stock-video searches matching THIS exact story (no generic skylines or unrelated foreign landmarks).',
    ].join(' ');

    const cleanHead = cleanHeadlineForDisplay(input.headline);
    const cleanSummary = cleanSpeechScript(input.description, cleanHead);

    const userPrompt = [
      `Category: ${input.category || 'News'}`,
      `Headline Hook: ${cleanHead}`,
      `Article Facts & Details: ${cleanSummary.slice(0, 2200)}`,
    ].join('\n');

    try {
      const response = await fetch(resolveLlmEndpoint(this.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          max_tokens: model.includes('qwen') ? 1000 : 750,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(4500),
      });

      if (!response.ok) {
        console.warn(`[ScriptRewriter] ⚠️ ${model} HTTP ${response.status}`);
        return {
          result: null,
          stopRetrying: response.status === 429 || response.status === 401 || response.status === 403,
        };
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent = (data?.choices?.[0]?.message?.content || '').trim();
      if (!rawContent) return { result: null };

      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { result: null };

      const parsed = JSON.parse(jsonMatch[0]) as {
        spokenScript?: string;
        brollQuery?: string;
        brollQueries?: string[];
        keyPoints?: string[];
        metrics?: Array<{ label?: string; value?: string }>;
        subjects?: Array<{ name?: string; role?: string }>;
      };
      let cleanedScript = cleanSpeechScript(
        (parsed.spokenScript || '').replace(/[*_`#"]/g, '').trim(),
        cleanHead
      );

      if (!cleanedScript || cleanedScript.length < 30) return { result: null };
      if (process.env.VERCEL) {
        cleanedScript = trimToCompleteSentences(cleanedScript, 580);
      } else {
        cleanedScript = trimToCompleteSentences(cleanedScript, 780);
      }

      const hasBengali = isBengaliText(cleanedScript);
      if (input.isEnglish && hasBengali) return { result: null };
      if (!input.isEnglish && !hasBengali) return { result: null };

      const rawQueries = [
        ...(Array.isArray(parsed.brollQueries) ? parsed.brollQueries : []),
        parsed.brollQuery || '',
      ]
        .map((q) => String(q || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim())
        .filter((q) => q.length >= 3);

      const brollQueries = Array.from(
        new Set([...rawQueries, ...fallback.brollQueries])
      ).slice(0, 4);

      const rawPoints = Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints
            .map((p) => String(p || '').replace(/[*_`#"]/g, '').trim())
            .filter((p) => p.length >= 8 && p.length <= 90)
        : [];
      const keyPoints =
        rawPoints.length >= 2
          ? rawPoints.slice(0, 3)
          : this.buildKeyPoints(cleanHead, cleanedScript, input.category, input.isEnglish);

      const parsedMetrics: StoryMetric[] = Array.isArray(parsed.metrics)
        ? parsed.metrics
            .map((m) => ({
              label: String(m?.label || '').trim(),
              value: String(m?.value || '').trim(),
              numericValue: this.parseNumericScale(String(m?.value || ''), String(m?.value || '')),
            }))
            .filter((m) => m.label && m.value)
            .slice(0, 3)
        : [];
      const metrics = parsedMetrics.length > 0 ? parsedMetrics : fallback.metrics;

      const parsedSubjects: StorySubject[] = Array.isArray(parsed.subjects)
        ? parsed.subjects
            .map((s) => ({
              name: String(s?.name || '').trim(),
              role: String(s?.role || '').trim(),
            }))
            .filter((s) => s.name && s.role)
            .slice(0, 3)
        : [];
      const subjects = parsedSubjects.length > 0 ? parsedSubjects : fallback.subjects;

      console.log(
        `[ScriptRewriter] ✨ Editorial script via ${model} (${cleanedScript.length} chars, metrics=${metrics.length}, subjects=${subjects.length})`
      );
      return {
        result: {
          spokenScript: cleanedScript,
          brollQuery: brollQueries[0] || fallback.brollQuery,
          brollQueries,
          keyPoints,
          metrics,
          subjects,
          rewrittenByLlm: true,
        },
      };
    } catch (err: any) {
      console.warn(`[ScriptRewriter] ⚠️ ${model} error: ${err?.message || err}`);
      return { result: null };
    }
  }
}
