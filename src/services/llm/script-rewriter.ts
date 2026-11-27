import { config } from '../../config/env.js';
import { PixabayVideoService } from '../media/pixabay.js';
import { cleanSpeechScript, isBengaliText } from '../tts/cleaner.js';
import { isLlmEndpointConfigured, resolveLlmEndpoint } from './client.js';

export interface ReelScriptRewriteResult {
  spokenScript: string;
  brollQuery: string;
  rewrittenByLlm: boolean;
}

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
    const fallbackScript = cleanSpeechScript(input.description, input.headline);
    const fallbackQuery = PixabayVideoService.getCategoryFallbackQuery(input.category);

    if (!this.isConfigured() || (!input.headline && !input.description)) {
      return {
        spokenScript: fallbackScript,
        brollQuery: fallbackQuery,
        rewrittenByLlm: false,
      };
    }

    const modelsToTry = process.env.VERCEL
      ? [this.primaryModel].filter(Boolean)
      : Array.from(new Set([this.primaryModel, 'free-router'].filter(Boolean)));
    for (const model of modelsToTry) {
      const outcome = await this.requestRewrite(model, input);
      if (outcome.result) {
        return outcome.result;
      }
      if (outcome.stopRetrying) {
        break;
      }
    }

    return {
      spokenScript: fallbackScript,
      brollQuery: fallbackQuery,
      rewrittenByLlm: false,
    };
  }

  private async requestRewrite(
    model: string,
    input: { headline: string; description?: string; category?: string; isEnglish: boolean }
  ): Promise<{ result: ReelScriptRewriteResult | null; stopRetrying?: boolean }> {
    const langInstruction = input.isEnglish
      ? 'Write spokenScript in crisp, engaging broadcast news English (2-3 natural sentences, 35-65 words). Never copy concatenated source names (like CNN, Mashable, NYT) or "Read the latest breaking report" boilerplate.'
      : 'Write spokenScript in natural, grammatical Dhaka TV broadcast Bangla (Bengali script, 2-3 clear sentences). Keep every fact, name, and number accurate; do NOT translate to English and do NOT add any comment-link CTA.';

    const systemPrompt = [
      'You are a television news anchor scriptwriter.',
      'Return ONLY valid JSON with two string fields: {"spokenScript":"...","brollQuery":"..."}.',
      langInstruction,
      'brollQuery MUST be 2-4 simple English visual keywords for stock B-roll video search (e.g. "stock market city", "parliament diplomacy", "dhaka metro train").',
    ].join(' ');

    const userPrompt = [
      `Category: ${input.category || 'News'}`,
      `Headline: ${input.headline}`,
      `Source Summary: ${(input.description || input.headline).slice(0, 1200)}`,
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
          max_tokens: model.includes('qwen') ? 900 : 450,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(3500),
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

      const parsed = JSON.parse(jsonMatch[0]) as { spokenScript?: string; brollQuery?: string };
      const cleanedScript = cleanSpeechScript(
        (parsed.spokenScript || '').replace(/[*_`#"]/g, '').trim(),
        input.headline
      );

      if (!cleanedScript || cleanedScript.length < 20) return { result: null };

      const hasBengali = isBengaliText(cleanedScript);
      if (input.isEnglish && hasBengali) return { result: null };
      if (!input.isEnglish && !hasBengali) return { result: null };

      const brollQuery =
        (parsed.brollQuery || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim() ||
        PixabayVideoService.getCategoryFallbackQuery(input.category);

      console.log(
        `[ScriptRewriter] ✨ Rewrote script via ${model} (${cleanedScript.length} chars, broll="${brollQuery}")`
      );
      return {
        result: {
          spokenScript: cleanedScript,
          brollQuery,
          rewrittenByLlm: true,
        },
      };
    } catch (err: any) {
      console.warn(`[ScriptRewriter] ⚠️ ${model} error: ${err?.message || err}`);
      return { result: null };
    }
  }
}
