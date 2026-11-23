import { EasyVoiceTtsService } from './easyvoice.js';
import { EdgeTtsService } from './edge-tts.js';
import { SynthesisOptions, TtsConnectionStatus } from './types.js';

export class UnifiedTtsService {
  private easyVoiceTts: EasyVoiceTtsService;
  private edgeTts: EdgeTtsService;

  constructor() {
    this.easyVoiceTts = new EasyVoiceTtsService();
    this.edgeTts = new EdgeTtsService();
  }

  public isBengali(text: string): boolean {
    if (/[\u0980-\u09FF]/.test(text)) return true;
    const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
    return nonAscii / text.length > 0.4;
  }

  public cleanDescription(description?: string, headline?: string): string {
    return this.edgeTts.cleanDescription(description, headline);
  }

  public async synthesize(
    text: string,
    options?: SynthesisOptions
  ): Promise<Buffer | null> {
    const cleanText = (text || '').trim();
    if (!cleanText) return null;

    const hasBengali = this.isBengali(cleanText);
    const isEn = options?.isEnglish !== undefined ? options.isEnglish : !hasBengali;

    // 1. BANGLA TEXT:
    // EasyVoice (Kokoro-82M / af_aoede) only supports English/Latin phonemes and cannot pronounce
    // Bengali Unicode characters properly.
    // For Bangla, Microsoft Edge Neural TTS (bn-BD-NabanitaNeural) provides authentic, natural,
    // and fluent Dhaka news broadcast voiceover.
    if (!isEn || hasBengali) {
      if (options?.provider === 'easyvoice') {
        console.log('[UnifiedTtsService] Explicit EasyVoice requested for Bangla text...');
        return this.easyVoiceTts.synthesize(cleanText, options);
      }

      console.log('[UnifiedTtsService] 🇧🇩 Bangla text detected -> using Microsoft Edge Neural TTS (bn-BD-NabanitaNeural)...');
      try {
        const audioBuffer = await this.edgeTts.synthesize(cleanText, {
          ...options,
          isEnglish: false,
          voice: options?.voice || EdgeTtsService.BENGALI_VOICE,
        });
        if (audioBuffer && audioBuffer.length > 500) {
          return audioBuffer;
        }
      } catch (err: any) {
        console.warn('[UnifiedTtsService] Edge TTS Bengali error:', err.message);
      }

      // Emergency fallback if Edge TTS fails
      if (this.easyVoiceTts.isConfigured()) {
        console.warn('[UnifiedTtsService] ⚠️ Edge TTS failed, attempting EasyVoice fallback...');
        return this.easyVoiceTts.synthesize(cleanText, options);
      }
      return null;
    }

    // 2. ENGLISH TEXT:
    // Use EasyVoice (Kokoro-82M / af_aoede) as primary, with Microsoft Edge TTS (en-US-GuyNeural) as fallback.
    if (this.easyVoiceTts.isConfigured() && options?.provider !== 'edgetts') {
      try {
        const audioBuffer = await this.easyVoiceTts.synthesize(cleanText, options);
        if (audioBuffer && audioBuffer.length > 500) {
          return audioBuffer;
        }
        console.warn('[UnifiedTtsService] ⚠️ EasyVoice returned empty buffer, falling back to Microsoft Edge TTS...');
      } catch (evErr: any) {
        console.warn(`[UnifiedTtsService] ⚠️ EasyVoice failed: ${evErr.message || evErr} -> falling back to Microsoft Edge TTS...`);
      }
    }

    console.log('[UnifiedTtsService] 🔄 Using fallback: Microsoft Edge Neural TTS (en-US-GuyNeural)...');
    return this.edgeTts.synthesize(cleanText, {
      ...options,
      isEnglish: true,
      voice: options?.voice || EdgeTtsService.ENGLISH_VOICE,
    });
  }

  public async testConnection(): Promise<TtsConnectionStatus> {
    const edgeStatus = await this.edgeTts.testConnection();
    const evConfigured = this.easyVoiceTts.isConfigured();

    return {
      available: edgeStatus.available || evConfigured,
      activeProvider: 'Edge TTS (Bangla) + EasyVoice (English)',
      voice: `${EdgeTtsService.BENGALI_VOICE} (Bangla) / af_aoede (English)`,
      message: `Bangla voiceover uses Microsoft Edge Neural (${EdgeTtsService.BENGALI_VOICE}); English voiceover uses EasyVoice (Kokoro-82M).`,
    };
  }
}

export { EasyVoiceTtsService, EdgeTtsService };
export * from './types.js';
export * from './cleaner.js';
