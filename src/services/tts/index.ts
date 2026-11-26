import { CartesiaTtsService } from './cartesia.js';
import { isBengaliText, resolveTtsLanguage } from './cleaner.js';
import { EasyVoiceTtsService } from './easyvoice.js';
import { EdgeTtsService } from './edge-tts.js';
import { ElevenLabsTtsService } from './elevenlabs.js';
import { MurfTtsService } from './murf.js';
import { SynthesisOptions, TtsConnectionStatus } from './types.js';

interface TtsProviderStep {
  name: string;
  enabled: boolean;
  synthesize: () => Promise<Buffer | null>;
}

/**
 * Unified TTS orchestrator with multi-provider fallback:
 * ElevenLabs -> Cartesia -> Murf AI -> EasyVoice / Microsoft Edge TTS.
 */
export class UnifiedTtsService {
  private elevenLabsTts: ElevenLabsTtsService;
  private cartesiaTts: CartesiaTtsService;
  private murfTts: MurfTtsService;
  private easyVoiceTts: EasyVoiceTtsService;
  private edgeTts: EdgeTtsService;

  constructor() {
    this.elevenLabsTts = new ElevenLabsTtsService();
    this.cartesiaTts = new CartesiaTtsService();
    this.murfTts = new MurfTtsService();
    this.easyVoiceTts = new EasyVoiceTtsService();
    this.edgeTts = new EdgeTtsService();
  }

  public isBengali(text: string): boolean {
    return isBengaliText(text);
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

    const { isEnglish } = resolveTtsLanguage(cleanText, options?.isEnglish);

    if (options?.provider && options.provider !== 'auto') {
      return this.synthesizeWithExplicitProvider(cleanText, options.provider, {
        ...options,
        isEnglish,
      });
    }

    // Strip provider-specific voice overrides in auto fallback mode so each provider uses its native voice.
    const { voice: _ignoredVoice, ...autoOptions } = options || {};
    const stepOptions: SynthesisOptions = { ...autoOptions, isEnglish };

    const primaryCloudSteps: TtsProviderStep[] = [
      {
        name: 'ElevenLabs',
        enabled: this.elevenLabsTts.isConfigured(),
        synthesize: () => this.elevenLabsTts.synthesize(cleanText, stepOptions),
      },
      {
        name: 'Cartesia',
        enabled: this.cartesiaTts.isConfigured(),
        synthesize: () => this.cartesiaTts.synthesize(cleanText, stepOptions),
      },
      {
        name: 'MurfAI',
        enabled: this.murfTts.isConfigured(),
        synthesize: () => this.murfTts.synthesize(cleanText, stepOptions),
      },
    ];

    const fallbackSteps: TtsProviderStep[] = isEnglish
      ? [
          {
            name: 'EasyVoice',
            enabled: this.easyVoiceTts.isConfigured(),
            synthesize: () => this.easyVoiceTts.synthesize(cleanText, stepOptions),
          },
          {
            name: 'EdgeTTS',
            enabled: true,
            synthesize: () =>
              this.edgeTts.synthesize(cleanText, {
                ...stepOptions,
                voice: EdgeTtsService.ENGLISH_VOICE,
              }),
          },
        ]
      : [
          {
            name: 'EdgeTTS',
            enabled: true,
            synthesize: () =>
              this.edgeTts.synthesize(cleanText, {
                ...stepOptions,
                voice: EdgeTtsService.BENGALI_VOICE,
              }),
          },
          {
            name: 'EasyVoice',
            enabled: this.easyVoiceTts.isConfigured(),
            synthesize: () => this.easyVoiceTts.synthesize(cleanText, stepOptions),
          },
        ];

    return this.runFallbackChain([...primaryCloudSteps, ...fallbackSteps], isEnglish ? 'English' : 'Bangla');
  }

  private async synthesizeWithExplicitProvider(
    text: string,
    provider: NonNullable<SynthesisOptions['provider']>,
    options: SynthesisOptions
  ): Promise<Buffer | null> {
    switch (provider) {
      case 'elevenlabs':
        return this.elevenLabsTts.synthesize(text, options);
      case 'cartesia':
        return this.cartesiaTts.synthesize(text, options);
      case 'murf':
        return this.murfTts.synthesize(text, options);
      case 'easyvoice':
        return this.easyVoiceTts.synthesize(text, options);
      case 'edgetts':
        return this.edgeTts.synthesize(text, {
          ...options,
          voice:
            options.voice ||
            (options.isEnglish ? EdgeTtsService.ENGLISH_VOICE : EdgeTtsService.BENGALI_VOICE),
        });
      default:
        return null;
    }
  }

  private async runFallbackChain(steps: TtsProviderStep[], languageLabel: string): Promise<Buffer | null> {
    const enabledSteps = steps.filter((s) => s.enabled);

    for (let i = 0; i < enabledSteps.length; i++) {
      const step = enabledSteps[i];
      const nextStep = enabledSteps[i + 1];
      try {
        const audioBuffer = await step.synthesize();
        if (audioBuffer && audioBuffer.length > 500) {
          return audioBuffer;
        }
        if (nextStep) {
          console.warn(
            `[UnifiedTtsService] ⚠️ ${step.name} returned empty buffer (${languageLabel}), falling back to ${nextStep.name}...`
          );
        }
      } catch (err: any) {
        if (nextStep) {
          console.warn(
            `[UnifiedTtsService] ⚠️ ${step.name} failed (${languageLabel}): ${err?.message || err} -> falling back to ${nextStep.name}...`
          );
        } else {
          console.warn(`[UnifiedTtsService] ❌ ${step.name} failed (${languageLabel}): ${err?.message || err}`);
        }
      }
    }

    return null;
  }

  public async testConnection(): Promise<TtsConnectionStatus> {
    const edgeStatus = await this.edgeTts.testConnection();
    const elConfigured = this.elevenLabsTts.isConfigured();
    const cartesiaConfigured = this.cartesiaTts.isConfigured();
    const murfConfigured = this.murfTts.isConfigured();
    const evConfigured = this.easyVoiceTts.isConfigured();

    const activeChain = [
      elConfigured ? 'ElevenLabs' : null,
      cartesiaConfigured ? 'Cartesia' : null,
      murfConfigured ? 'Murf AI' : null,
      evConfigured ? 'EasyVoice' : null,
      edgeStatus.available ? 'Edge TTS' : null,
    ].filter(Boolean);

    return {
      available: elConfigured || cartesiaConfigured || murfConfigured || evConfigured || edgeStatus.available,
      activeProvider: activeChain.join(' -> ') || 'None',
      voice: `ElevenLabs (${this.elevenLabsTts.getDefaultVoice(true)}) / Cartesia (${this.cartesiaTts.getDefaultVoice(false)}) / Murf (${this.murfTts.getDefaultVoice(true)}, ${this.murfTts.getDefaultVoice(false)}) / Edge (${EdgeTtsService.BENGALI_VOICE})`,
      message: `Priority chain: ElevenLabs -> Cartesia -> Murf AI -> EasyVoice / Microsoft Edge TTS (${activeChain.length} active providers).`,
    };
  }
}

export { ElevenLabsTtsService, CartesiaTtsService, MurfTtsService, EasyVoiceTtsService, EdgeTtsService };
export * from './types.js';
export * from './cleaner.js';
