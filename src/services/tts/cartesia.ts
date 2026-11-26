import { config } from '../../config/env.js';
import { resolveTtsLanguage } from './cleaner.js';
import { postTtsAudioRequest } from './http.js';
import { SynthesisOptions } from './types.js';

/**
 * Text-to-Speech adapter for Cartesia Sonic (`sonic-3` by default for English & Bangla).
 */
export class CartesiaTtsService {
  private apiKey: string;
  private baseUrl: string;
  private apiVersion: string;
  private modelId: string;
  private englishVoiceId: string;
  private banglaVoiceId: string;

  constructor() {
    this.apiKey = (config.CARTESIA_API_KEY || '').trim();
    this.baseUrl = (config.CARTESIA_BASE_URL || 'https://api.cartesia.ai').replace(/\/+$/, '');
    this.apiVersion = config.CARTESIA_VERSION || '2025-04-16';
    this.modelId = config.CARTESIA_MODEL_ID || 'sonic-3';
    this.englishVoiceId = config.CARTESIA_VOICE_ID || 'a33f7a4c-100f-41cf-a1fd-5822e8fc253f';
    this.banglaVoiceId = config.CARTESIA_VOICE_ID_BN || '314be1d2-3d14-468d-be40-08a1af7df49d';
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

    const { isEnglish, languageCode } = resolveTtsLanguage(cleanText, options?.isEnglish);
    const voiceId = options?.voice || this.getDefaultVoice(isEnglish);

    console.log(
      `[Cartesia] 🎙️ Synthesizing voiceover (${this.modelId} / ${languageCode} / ${voiceId}): "${cleanText.substring(0, 50)}..."`
    );

    return postTtsAudioRequest({
      providerName: 'Cartesia',
      url: `${this.baseUrl}/tts/bytes`,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Cartesia-Version': this.apiVersion,
        'Content-Type': 'application/json',
      },
      body: {
        model_id: this.modelId,
        transcript: cleanText,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'mp3',
          bit_rate: 128000,
          sample_rate: 44100,
        },
        language: languageCode,
      },
      successDetail: `lang: ${languageCode}, voice: ${voiceId}`,
    });
  }
}
