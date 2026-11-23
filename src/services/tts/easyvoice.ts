import OpenAI from 'openai';
import { config } from '../../config/env.js';
import { SynthesisOptions } from './types.js';

export class EasyVoiceTtsService {
  private client: OpenAI | null = null;
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private defaultVoice: string;

  constructor() {
    this.apiKey =
      config.EASYVOICE_API_KEY ||
      'ev_fdd375170e510aad890bbac22db2e635a6d0a44a5dd2546ced2a8366172b8d0a';
    this.baseURL = config.EASYVOICE_BASE_URL || 'https://easyvoice.ae/api/v1';
    this.model = config.EASYVOICE_MODEL || 'kokoro-82m';
    this.defaultVoice = config.EASYVOICE_VOICE || 'af_aoede';

    if (this.apiKey) {
      try {
        this.client = new OpenAI({
          apiKey: this.apiKey,
          baseURL: this.baseURL,
          timeout: 15000,
          maxRetries: 1,
        });
      } catch (err: any) {
        console.warn('[EasyVoice] Could not initialize OpenAI client:', err.message);
        this.client = null;
      }
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.client && this.apiKey);
  }

  public async synthesize(text: string, options?: SynthesisOptions): Promise<Buffer | null> {
    const cleanText = (text || '').trim();
    if (!cleanText || !this.client) return null;

    const voice = options?.voice || this.defaultVoice;
    console.log(`[EasyVoice] 🎙️ Synthesizing voiceover (${this.model} / ${voice}): "${cleanText.substring(0, 50)}..."`);

    try {
      const response = await this.client.audio.speech.create({
        model: this.model,
        voice: voice,
        input: cleanText,
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer && buffer.length > 500) {
        console.log(`[EasyVoice] ✅ Voiceover generated successfully (${buffer.length} bytes, voice: ${voice})`);
        return buffer;
      }

      console.warn(`[EasyVoice] Returned buffer too small (${buffer?.length || 0} bytes)`);
      return null;
    } catch (err: any) {
      console.warn(`[EasyVoice] ⚠️ Synthesis error: ${err.message || err}`);
      return null;
    }
  }
}
