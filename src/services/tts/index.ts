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

  public cleanDescription(description?: string, headline?: string): string {
    return this.edgeTts.cleanDescription(description, headline);
  }

  public async synthesize(
    text: string,
    options?: SynthesisOptions
  ): Promise<Buffer | null> {
    const cleanText = (text || '').trim();
    if (!cleanText) return null;

    // 1. Primary: EasyVoice OpenAI-compatible TTS API
    if (this.easyVoiceTts.isConfigured()) {
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

    // 2. Fallback: Microsoft Edge Neural TTS
    console.log('[UnifiedTtsService] 🔄 Using fallback: Microsoft Edge Neural TTS...');
    return this.edgeTts.synthesize(cleanText, options);
  }

  public async testConnection(): Promise<TtsConnectionStatus> {
    if (this.easyVoiceTts.isConfigured()) {
      try {
        const evTest = await this.easyVoiceTts.synthesize('Testing EasyVoice voiceover connection.');
        if (evTest && evTest.length > 500) {
          return {
            available: true,
            activeProvider: 'EasyVoice (Primary)',
            voice: 'af_aoede',
            message: 'EasyVoice Kokoro-82M TTS is active and generating speech.',
          };
        }
      } catch (err: any) {
        console.warn('[UnifiedTtsService] EasyVoice test note:', err.message);
      }
    }

    const edgeStatus = await this.edgeTts.testConnection();
    return {
      ...edgeStatus,
      activeProvider: `${edgeStatus.activeProvider} (Fallback)`,
      message: `EasyVoice unavailable. Fallback active: ${edgeStatus.message}`,
    };
  }
}

export { EasyVoiceTtsService, EdgeTtsService };
export * from './types.js';
export * from './cleaner.js';
