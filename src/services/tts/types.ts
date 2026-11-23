export interface SynthesisOptions {
  voice?: string;
  speed?: number;
  isEnglish?: boolean;
  rate?: string;
  pitch?: string;
  volume?: string;
  provider?: 'easyvoice' | 'edgetts' | 'auto';
}

export interface TtsConnectionStatus {
  available: boolean;
  activeProvider: string;
  voice?: string;
  message: string;
}
