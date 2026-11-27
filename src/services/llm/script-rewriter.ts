import { config } from '../../config/env.js';
import { resolveCategoryTheme } from '../../config/constants.js';
import { PixabayVideoService } from '../media/pixabay.js';
import { cleanSpeechScript, isBengaliText, stripRepeatedHeadlinePrefix } from '../tts/cleaner.js';
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
    const cleanDesc = cleanSpeechScript(input.description, input.headline);
    const bodyOnly = stripRepeatedHeadlinePrefix(cleanDesc, input.headline);
    const catKey = resolveCategoryTheme(input.category);
    const topicRule = TOPIC_EDITORIAL_NOTES.find((r) =>
      r.pattern.test(`${input.headline} ${cleanDesc} ${input.category || ''}`)
    );
    const contextNote =
      topicRule || EDITORIAL_CONTEXT_NOTES[catKey] || EDITORIAL_CONTEXT_NOTES['cat-international'];

    let spokenScript = cleanDesc;
    const isShortOrThin = !bodyOnly || bodyOnly.length < 95 || spokenScript.length < 150;
    if (isShortOrThin) {
      // Avoid trailing unpunctuated outlet-only tags (e.g. "...Doing It ScienceAlert") when description barely adds text
      const trimmedBase = bodyOnly && bodyOnly.length < 28 ? input.headline.trim() : cleanDesc || input.headline.trim();
      const endsWithPunct = /[।!?.\n]$/.test(trimmedBase);
      const sep = endsWithPunct ? ' ' : input.isEnglish ? '. ' : '। ';
      spokenScript = `${trimmedBase}${sep}${input.isEnglish ? contextNote.en : contextNote.bn}`;
    }

    if (process.env.VERCEL && spokenScript.length > 520) {
      spokenScript = spokenScript.slice(0, 520).replace(/\s+\S*$/, '').trim();
    }

    const brollQueries = PixabayVideoService.extractTopicVisualQueries(
      `${input.headline} ${cleanDesc}`,
      input.category
    );

    const keyPoints = this.buildKeyPoints(input.headline, spokenScript, input.category, input.isEnglish);

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
      text.length > 72 ? `${text.slice(0, 69).replace(/\s+\S*$/, '').trim()}...` : text;

    const points: string[] = [];
    if (clauses[0]) points.push(trimPoint(clauses[0]));
    if (clauses[1]) points.push(trimPoint(clauses[1]));
    if (clauses[2]) points.push(trimPoint(clauses[2]));

    if (points.length < 2) {
      points.push(
        isEnglish
          ? `${(category || 'News').toUpperCase()} Impact & Background Analysis`
          : `${category || 'বিশেষ খবর'} • প্রেক্ষাপট ও মূল প্রভাব বিশ্লেষণ`
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
      ? 'Write spokenScript in crisp, insightful editorial broadcast English (3-4 natural sentences, 55-80 words): summarize the key event, explain broader context/impact (why it matters), and give an analytical takeaway. Never copy source boilerplate or mention comments.'
      : 'Write spokenScript in natural, analytical Dhaka TV broadcast Bangla (Bengali script, 3-4 clear sentences, 55-80 words): cover the core event, background context, and public/policy significance. Never translate to English and never include any comment-link CTA.';

    const keyPointInstruction = input.isEnglish
      ? 'keyPoints: array of 3 concise on-screen editorial bullet phrases in English (5-9 words each) covering Facts, Context, and Impact.'
      : 'keyPoints: array of 3 concise on-screen editorial bullet phrases in Bengali script (4-8 words each) covering মূল তথ্য, প্রেক্ষাপট, and প্রভাব।';

    const systemPrompt = [
      'You are a television news editor writing original commentary scripts for short vertical video reports.',
      'Return ONLY valid JSON: {"spokenScript":"...","brollQueries":["...","...","..."],"keyPoints":["...","...","..."]}.',
      langInstruction,
      keyPointInstruction,
      'brollQueries MUST be an array of 3 distinct 2-4 word English stock-video searches matching concrete visuals of THIS exact story (avoid generic city skyline unless the story is about architecture/cities).',
    ].join(' ');

    const userPrompt = [
      `Category: ${input.category || 'News'}`,
      `Headline: ${input.headline}`,
      `Source Summary: ${(input.description || input.headline).slice(0, 1400)}`,
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
        input.headline
      );

      if (!cleanedScript || cleanedScript.length < 30) return { result: null };
      if (process.env.VERCEL && cleanedScript.length > 560) {
        cleanedScript = cleanedScript.slice(0, 560).replace(/\s+\S*$/, '').trim();
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
          : this.buildKeyPoints(input.headline, cleanedScript, input.category, input.isEnglish);

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
