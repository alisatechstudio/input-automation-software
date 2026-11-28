import { config } from '../../config/env.js';
import { isLlmEndpointConfigured, isNaraRouterEndpoint, resolveLlmEndpoint } from '../llm/client.js';
import { resolveTtsLanguage } from './cleaner.js';
import { postTtsAudioRequest } from './http.js';
import { SynthesisOptions } from './types.js';

/**
 * Text-to-Speech adapter for OpenAI-compatible FreeLLMAPI `/v1/audio/speech` router endpoints.
 */
export class FreeLlmApiTtsService {
  private apiKey: string;
  private baseUrl: string;
  private englishModel: string;
  private banglaModel: string;
  private englishVoice: string;
  private banglaVoice: string;

  constructor() {
    this.apiKey = (config.LLM_TTS_API_KEY || '').trim();
    this.baseUrl = (config.LLM_TTS_BASE_URL || '').trim().replace(/\/+$/, '');
    this.englishModel = config.LLM_TTS_MODEL || 'auto';
    this.banglaModel = config.LLM_TTS_MODEL_BN || this.englishModel;
    this.englishVoice = config.LLM_TTS_VOICE || '';
    this.banglaVoice = config.LLM_TTS_VOICE_BN || this.englishVoice;
  }

  public isConfigured(): boolean {
    return (
      !isNaraRouterEndpoint(this.apiKey, this.baseUrl) &&
      isLlmEndpointConfigured(this.apiKey, this.baseUrl)
    );
  }

  public getDefaultVoice(isEnglish: boolean = true): string {
    return isEnglish ? this.englishVoice : this.banglaVoice;
  }

  private getSpeechUrl(): string {
    return resolveLlmEndpoint(this.baseUrl, '/audio/speech');
  }

  public async synthesize(text: string, options?: SynthesisOptions): Promise<Buffer | null> {
    const cleanText = (text || '').trim();
    if (!cleanText || !this.isConfigured()) return null;

    const { isEnglish, languageCode } = resolveTtsLanguage(cleanText, options?.isEnglish);
    const model = isEnglish ? this.englishModel : this.banglaModel;
    const voice = options?.voice || this.getDefaultVoice(isEnglish);

    console.log(
      `[FreeLLMAPI] 🎙️ Synthesizing voiceover (${model} / ${languageCode}${voice ? ` / ${voice}` : ''}): "${cleanText.substring(0, 50)}..."`
    );

    return postTtsAudioRequest({
      providerName: 'FreeLLMAPI',
      url: this.getSpeechUrl(),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model,
        input: cleanText,
        ...(voice ? { voice } : {}),
        ...(typeof options?.speed === 'number' ? { speed: options.speed } : {}),
      },
      successDetail: `model: ${model}, lang: ${languageCode}${voice ? `, voice: ${voice}` : ''}`,
    });
  }
}
