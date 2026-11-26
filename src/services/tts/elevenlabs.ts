import { config } from '../../config/env.js';
import { resolveTtsLanguage } from './cleaner.js';
import { postTtsAudioRequest } from './http.js';
import { SynthesisOptions } from './types.js';

/**
 * Text-to-Speech adapter for the ElevenLabs REST API (`eleven_v3` by default for English & Bangla).
 */
export class ElevenLabsTtsService {
  private apiKey: string;
  private baseUrl: string;
  private modelId: string;
  private englishVoiceId: string;
  private banglaVoiceId: string;

  constructor() {
    this.apiKey = (config.ELEVENLABS_API_KEY || '').trim();
    this.baseUrl = (config.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
    this.modelId = config.ELEVENLABS_MODEL_ID || 'eleven_v3';
    this.englishVoiceId = config.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9';
    this.banglaVoiceId = config.ELEVENLABS_VOICE_ID_BN || this.englishVoiceId;
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
    // eleven_multilingual_v2 does not support Bengali; upgrade automatically to eleven_v3 for Bangla text.
    const modelId = !isEnglish && this.modelId === 'eleven_multilingual_v2' ? 'eleven_v3' : this.modelId;

    console.log(
      `[ElevenLabs] 🎙️ Synthesizing voiceover (${modelId} / ${languageCode} / ${voiceId}): "${cleanText.substring(0, 50)}..."`
    );

    return postTtsAudioRequest({
      providerName: 'ElevenLabs',
      url: `${this.baseUrl}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: {
        text: cleanText,
        model_id: modelId,
        language_code: languageCode,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
      successDetail: `lang: ${languageCode}, voice: ${voiceId}`,
    });
  }
}
