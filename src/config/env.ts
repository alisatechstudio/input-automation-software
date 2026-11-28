import dotenv from 'dotenv';
import path from 'path';
import {
  isLoopbackLlmUrl,
  isNaraRouterEndpoint,
  NARAROUTER_BASE_URL,
  NARAROUTER_DEFAULT_CHAT_MODEL,
} from '../services/llm/client.js';

dotenv.config();

export interface InputAppConfig {
  PORT: number;
  NODE_ENV: string;
  MONGODB_URI: string;
  MONGODB_DB_NAME: string;
  DRY_RUN: boolean;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  GOOGLE_DRIVE_API_KEY?: string;
  GDRIVE_FOLDER_ID?: string;
  CRON_ENABLED: boolean;
  CRON_SCHEDULE: string;
  MAX_ARTICLE_AGE_HOURS: number;
  REEL_DEFAULT_DURATION: number;
  REEL_DEFAULT_THEME: string;
  REEL_RESOLUTION: string;
  PIXABAY_API_KEY: string;
  LLM_API_KEY: string;
  LLM_BASE_URL: string;
  LLM_CHAT_MODEL: string;
  LLM_SCRIPT_REWRITE: boolean;
  LLM_TTS_API_KEY: string;
  LLM_TTS_BASE_URL: string;
  LLM_TTS_MODEL: string;
  LLM_TTS_MODEL_BN: string;
  LLM_TTS_VOICE: string;
  LLM_TTS_VOICE_BN: string;
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_BASE_URL: string;
  ELEVENLABS_MODEL_ID: string;
  ELEVENLABS_VOICE_ID: string;
  ELEVENLABS_VOICE_ID_BN: string;
  CARTESIA_API_KEY: string;
  CARTESIA_BASE_URL: string;
  CARTESIA_VERSION: string;
  CARTESIA_MODEL_ID: string;
  CARTESIA_VOICE_ID: string;
  CARTESIA_VOICE_ID_BN: string;
  MURF_API_KEY: string;
  MURF_BASE_URL: string;
  MURF_MODEL: string;
  MURF_VOICE_ID: string;
  MURF_VOICE_ID_BN: string;
  MURF_LOCALE_EN: string;
  MURF_LOCALE_BN: string;
  EASYVOICE_API_KEY: string;
  EASYVOICE_BASE_URL: string;
  EASYVOICE_MODEL: string;
  EASYVOICE_VOICE: string;
  DATA_DIR: string;
  ASSETS_DIR: string;
}

const rootDir = process.cwd();
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');
const assetsDir = process.env.ASSETS_DIR || path.join(rootDir, 'assets');

const ATLAS_DEFAULT_URI =
  'mongodb+srv://Vercel-Admin-atlas-copper-notebook:BNp8pQVDocNKaDwL@atlas-copper-notebook.0czlcmy.mongodb.net/?retryWrites=true&w=majority';

const naraApiKey = (process.env.NARAROUTER_API_KEY || '').trim();
const explicitLlmApiKey = (process.env.LLM_API_KEY || '').trim();
const freeLlmApiKey = (process.env.FREELMAPI_API_KEY || '').trim();
const resolvedLlmApiKey = naraApiKey || explicitLlmApiKey || freeLlmApiKey;
const isNaraKey = Boolean(naraApiKey) || resolvedLlmApiKey.startsWith('sk-nry-');
const rawChatBaseUrl = (
  (naraApiKey
    ? process.env.NARAROUTER_BASE_URL ||
      (isNaraRouterEndpoint('', process.env.LLM_BASE_URL || '') ? process.env.LLM_BASE_URL : '')
    : process.env.NARAROUTER_BASE_URL || process.env.LLM_BASE_URL) || ''
).trim();
const resolvedLlmBaseUrl =
  rawChatBaseUrl && !(isNaraKey && isLoopbackLlmUrl(rawChatBaseUrl))
    ? rawChatBaseUrl
    : isNaraKey
    ? NARAROUTER_BASE_URL
    : process.env.FREELMAPI_BASE_URL || 'http://127.0.0.1:31415/v1';
const isNaraConfigured = isNaraRouterEndpoint(resolvedLlmApiKey, resolvedLlmBaseUrl);
const rawChatModel = (
  process.env.NARAROUTER_CHAT_MODEL ||
  process.env.LLM_CHAT_MODEL ||
  process.env.FREELMAPI_CHAT_MODEL ||
  ''
).trim();
const resolvedChatModel =
  isNaraConfigured && (!rawChatModel || /^(mistral-small-3\.2-24b|free-router)$/i.test(rawChatModel))
    ? NARAROUTER_DEFAULT_CHAT_MODEL
    : rawChatModel || 'mistral-small-3.2-24b';
const resolvedTtsApiKey = (
  process.env.LLM_TTS_API_KEY ||
  freeLlmApiKey ||
  (isNaraConfigured ? '' : resolvedLlmApiKey)
).trim();
const resolvedTtsBaseUrl = (
  process.env.LLM_TTS_BASE_URL ||
  process.env.FREELMAPI_BASE_URL ||
  (isNaraConfigured ? '' : resolvedLlmBaseUrl)
).trim();

export const config: InputAppConfig = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI:
    process.env.MONGODB_URI ||
    process.env.MONGODB_URL ||
    process.env.MONGO_URL ||
    (process.env.DATABASE_URL?.startsWith('mongodb') ? process.env.DATABASE_URL : '') ||
    ATLAS_DEFAULT_URI,
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || 'news_automation',
  DRY_RUN: process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN:
    process.env.GOOGLE_REFRESH_TOKEN ||
    process.env.GDRIVE_REFRESH_TOKEN ||
    process.env.YOUTUBE_REFRESH_TOKEN,
  GOOGLE_DRIVE_API_KEY: process.env.GOOGLE_DRIVE_API_KEY || process.env.GDRIVE_API_KEY,
  GDRIVE_FOLDER_ID: process.env.GDRIVE_FOLDER_ID || process.env.GDRIVE_SPORTS_FOLDER_ID || '',
  CRON_ENABLED: process.env.CRON_ENABLED !== 'false',
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || '*/15 * * * *',
  MAX_ARTICLE_AGE_HOURS: process.env.MAX_ARTICLE_AGE_HOURS ? parseInt(process.env.MAX_ARTICLE_AGE_HOURS, 10) : 24,
  REEL_DEFAULT_DURATION: process.env.REEL_DEFAULT_DURATION ? parseInt(process.env.REEL_DEFAULT_DURATION, 10) : 8,
  REEL_DEFAULT_THEME: process.env.REEL_DEFAULT_THEME || 'canva-studio-rotate',
  REEL_RESOLUTION: process.env.REEL_RESOLUTION || (process.env.VERCEL ? '540p' : '1080p'),
  PIXABAY_API_KEY: process.env.PIXABAY_API_KEY || '',
  LLM_API_KEY: resolvedLlmApiKey,
  LLM_BASE_URL: resolvedLlmBaseUrl,
  LLM_CHAT_MODEL: resolvedChatModel,
  LLM_SCRIPT_REWRITE: process.env.LLM_SCRIPT_REWRITE !== 'false',
  LLM_TTS_API_KEY: resolvedTtsApiKey,
  LLM_TTS_BASE_URL: resolvedTtsBaseUrl,
  LLM_TTS_MODEL: process.env.LLM_TTS_MODEL || process.env.FREELMAPI_TTS_MODEL || 'auto',
  LLM_TTS_MODEL_BN:
    process.env.LLM_TTS_MODEL_BN ||
    process.env.LLM_TTS_MODEL ||
    process.env.FREELMAPI_TTS_MODEL ||
    'auto',
  LLM_TTS_VOICE: process.env.LLM_TTS_VOICE || process.env.FREELMAPI_TTS_VOICE || '',
  LLM_TTS_VOICE_BN:
    process.env.LLM_TTS_VOICE_BN ||
    process.env.LLM_TTS_VOICE ||
    process.env.FREELMAPI_TTS_VOICE ||
    '',
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  ELEVENLABS_BASE_URL: process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1',
  ELEVENLABS_MODEL_ID: process.env.ELEVENLABS_MODEL_ID || 'eleven_v3',
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9',
  ELEVENLABS_VOICE_ID_BN:
    process.env.ELEVENLABS_VOICE_ID_BN || process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9',
  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY || '',
  CARTESIA_BASE_URL: process.env.CARTESIA_BASE_URL || 'https://api.cartesia.ai',
  CARTESIA_VERSION: process.env.CARTESIA_VERSION || '2025-04-16',
  CARTESIA_MODEL_ID: process.env.CARTESIA_MODEL_ID || 'sonic-3',
  CARTESIA_VOICE_ID: process.env.CARTESIA_VOICE_ID || 'a33f7a4c-100f-41cf-a1fd-5822e8fc253f',
  CARTESIA_VOICE_ID_BN: process.env.CARTESIA_VOICE_ID_BN || '314be1d2-3d14-468d-be40-08a1af7df49d',
  MURF_API_KEY: process.env.MURF_API_KEY || '',
  MURF_BASE_URL: process.env.MURF_BASE_URL || 'https://global.api.murf.ai/v1',
  MURF_MODEL: process.env.MURF_MODEL || 'falcon-2.1',
  MURF_VOICE_ID: process.env.MURF_VOICE_ID || 'Judith',
  MURF_VOICE_ID_BN: process.env.MURF_VOICE_ID_BN || 'bn-IN-arnab',
  MURF_LOCALE_EN: process.env.MURF_LOCALE_EN || 'en-US',
  MURF_LOCALE_BN: process.env.MURF_LOCALE_BN || 'bn-IN',
  EASYVOICE_API_KEY:
    process.env.EASYVOICE_API_KEY ||
    'ev_fdd375170e510aad890bbac22db2e635a6d0a44a5dd2546ced2a8366172b8d0a',
  EASYVOICE_BASE_URL: process.env.EASYVOICE_BASE_URL || 'https://easyvoice.ae/api/v1',
  EASYVOICE_MODEL: process.env.EASYVOICE_MODEL || 'kokoro-82m',
  EASYVOICE_VOICE: process.env.EASYVOICE_VOICE || 'af_aoede',
  DATA_DIR: dataDir,
  ASSETS_DIR: assetsDir,
};
