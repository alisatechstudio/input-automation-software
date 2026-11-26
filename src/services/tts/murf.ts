import { config } from '../../config/env.js';
import { resolveTtsLanguage } from './cleaner.js';
import { postTtsAudioRequest } from './http.js';
import { SynthesisOptions } from './types.js';

/**
 * Text-to-Speech adapter for the Murf AI streaming API (`falcon-2.1` for English & Bangla).
 */
export class MurfTtsService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private englishVoiceId: string;
  private banglaVoiceId: string;
  private englishLocale: string;
  private banglaLocale: string;

  constructor() {
    this.apiKey = (config.MURF_API_KEY || '').trim();
    this.baseUrl = (config.MURF_BASE_URL || 'https://global.api.murf.ai/v1').replace(/\/+$/, '');
    this.model = config.MURF_MODEL || 'falcon-2.1';
    this.englishVoiceId = config.MURF_VOICE_ID || 'Judith';
    this.banglaVoiceId = config.MURF_VOICE_ID_BN || 'bn-IN-arnab';
    this.englishLocale = config.MURF_LOCALE_EN || 'en-US';
    this.banglaLocale = config.MURF_LOCALE_BN || 'bn-IN';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  public getDefaultVoice(isEnglish: boolean = true): string {
    return isEnglish ? this.englishVoiceId : this.banglaVoiceId;
  }

  public async synthesize(text: string, options?: SynthesisOptions): Promise<Buffer | null> {
    const cleanText = (text || '').trim();
    if (!cleanText || !this.isConfigured()) return null;

    const { isEnglish } = resolveTtsLanguage(cleanText, options?.isEnglish);
    const voiceId = options?.voice || this.getDefaultVoice(isEnglish);
    const locale = isEnglish ? this.englishLocale : this.banglaLocale;

    console.log(
      `[MurfAI] 🎙️ Synthesizing voiceover (${this.model} / ${locale} / ${voiceId}): "${cleanText.substring(0, 50)}..."`
    );

    return postTtsAudioRequest({
      providerName: 'MurfAI',
      url: `${this.baseUrl}/speech/stream`,
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: {
        voiceId,
        text: cleanText,
        locale,
        model: this.model,
        format: 'MP3',
        sampleRate: 24000,
        channelType: 'MONO',
      },
      successDetail: `locale: ${locale}, voice: ${voiceId}`,
    });
  }
}
