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

export interface ReelScriptRewriteResult {
  spokenScript: string;
  brollQuery: string;
  brollQueries: string[];
  keyPoints: string[];
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
    en: 'Audience engagement and cross-border streaming trends continue to reshape viewer preferences across the region.',
    bn: 'সাম্প্রতিক দর্শক-আগ্রহ ও ডিজিটাল প্ল্যাটফর্মের প্রসার বিনোদন জগতে নতুন ধারার ইঙ্গিত দিচ্ছে।',
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

    let leadNarrative = completeSentences.slice(0, 2).join(' ').trim();
    if (!leadNarrative) {
      const baseLead = bodyOnly && bodyOnly.length >= 35 ? `${cleanHead}. ${bodyOnly}` : cleanHead;
      leadNarrative = /[.!?।]$/.test(baseLead) ? baseLead : `${baseLead}${input.isEnglish ? '.' : '।'}`;
    }

    const sep = /[.!?।]$/.test(leadNarrative) ? ' ' : input.isEnglish ? '. ' : '। ';
    const needsContext = completeSentences.length < 3 || leadNarrative.length < 180;
    let spokenScript = needsContext
      ? `${leadNarrative}${sep}${input.isEnglish ? contextNote.en : contextNote.bn}`
      : leadNarrative;

    if (process.env.VERCEL) {
      spokenScript = trimToCompleteSentences(spokenScript, 540);
    }

    const brollQueries = PixabayVideoService.extractTopicVisualQueries(
      `${cleanHead} ${cleanDesc}`,
      input.category
    );

    const keyPoints = this.buildKeyPoints(cleanHead, spokenScript, input.category, input.isEnglish);

    return {
      spokenScript,
      brollQuery: brollQueries[0] || PixabayVideoService.getCategoryFallbackQuery(input.category),
      brollQueries,
      keyPoints,
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
      ? 'Synthesize an ORIGINAL, cohesive editorial commentary in natural English (3-4 complete sentences, 55-80 words). NEVER read raw RSS headlines verbatim, NEVER mention third-party outlets (NYT, CNN, Wirecutter, NBC, Google News), NEVER include truncated lists or comment CTAs, and NEVER claim to be a live broadcast.'
      : 'Synthesize an ORIGINAL, analytical Dhaka editorial commentary in natural Bangla (Bengali script, 3-4 complete sentences, 55-80 words). Explain facts, context, and why it matters. Never copy aggregator fragments, mention external comment links, or claim live broadcast.';

    const keyPointInstruction = input.isEnglish
      ? 'keyPoints: array of 3 clean on-screen editorial highlights in English (5-9 words each, proper spacing, zero publisher names).'
      : 'keyPoints: array of 3 clean on-screen editorial highlights in Bengali script (4-8 words each).';

    const systemPrompt = [
      'You are an editorial video scriptwriter producing original commentary reports.',
      'Return ONLY valid JSON: {"spokenScript":"...","brollQueries":["...","...","..."],"keyPoints":["...","...","..."]}.',
      langInstruction,
      keyPointInstruction,
      'brollQueries MUST be an array of 3-4 distinct 2-4 word English stock-video searches matching THIS exact story topic (never generic skylines or unrelated circuit boards).',
    ].join(' ');

    const cleanHead = cleanHeadlineForDisplay(input.headline);
    const cleanSummary = cleanSpeechScript(input.description, cleanHead);

    const userPrompt = [
      `Category: ${input.category || 'News'}`,
      `Topic: ${cleanHead}`,
      `Cleaned Context: ${cleanSummary.slice(0, 1400)}`,
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
          max_tokens: model.includes('qwen') ? 1000 : 600,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(4000),
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
      };
      let cleanedScript = cleanSpeechScript(
        (parsed.spokenScript || '').replace(/[*_`#"]/g, '').trim(),
        cleanHead
      );

      if (!cleanedScript || cleanedScript.length < 30) return { result: null };
      if (process.env.VERCEL) {
        cleanedScript = trimToCompleteSentences(cleanedScript, 560);
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

      console.log(
        `[ScriptRewriter] ✨ Editorial script via ${model} (${cleanedScript.length} chars, shots=${brollQueries.length}, points=${keyPoints.length})`
      );
      return {
        result: {
          spokenScript: cleanedScript,
          brollQuery: brollQueries[0] || fallback.brollQuery,
          brollQueries,
          keyPoints,
          rewrittenByLlm: true,
        },
      };
    } catch (err: any) {
      console.warn(`[ScriptRewriter] ⚠️ ${model} error: ${err?.message || err}`);
      return { result: null };
    }
  }
}
