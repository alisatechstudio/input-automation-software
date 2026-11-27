import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../../config/env.js';
import { resolveCategoryTheme } from '../../config/constants.js';

interface PixabayVideoFile {
  url?: string;
  width?: number;
  height?: number;
  size?: number;
}

interface PixabayVideoHit {
  id: number;
  tags?: string;
  duration?: number;
  videos?: {
    large?: PixabayVideoFile;
    medium?: PixabayVideoFile;
    small?: PixabayVideoFile;
    tiny?: PixabayVideoFile;
  };
}

const CATEGORY_VIDEO_QUERIES: Record<string, string> = {
  'cat-politics': 'parliament government building press briefing',
  'cat-economy': 'financial market trading chart business',
  'cat-international': 'world map globe diplomacy conference',
  'cat-sports': 'stadium sports football cricket action',
  'cat-technology': 'technology computer code digital circuit',
  'cat-entertainment': 'cinema theater film stage spotlight',
  'cat-opinion': 'newspaper journalism editorial microphone',
  'cat-religion': 'mosque architecture peaceful sunrise',
  'cat-education': 'university campus lecture books',
  'cat-job': 'office workspace laptop business team',
  'cat-lifestyle': 'wellness nature lifestyle morning',
  'cat-todays-match': 'cricket football stadium crowd match',
  'cat-bangladesh': 'television newsroom journalism studio',
};

const TOPIC_VISUAL_RULES: Array<{ pattern: RegExp; queries: string[] }> = [
  {
    pattern: /drama|film|movie|cinema|actor|actress|series|music|concert|নাটক|সিনেমা|অভিন|শিল্পী|উন্মাদনা|বিয়ে|তারকা|বিনোদন/i,
    queries: ['cinema theater audience screen', 'film production camera stage'],
  },
  {
    pattern: /election|vote|referendum|parliament|minister|party|rally|protest|government|নির্বাচন|গণভোট|ভোট|সংসদ|রাজনীতি|আন্দোলন|মিছিল|দলীয়|মহাসচিব|বিএনপি|আওয়ামী|জামায়াত/i,
    queries: ['parliament hall government podium', 'democracy voting civic rally'],
  },
  {
    pattern: /garment|textile|factory|export|worker|পোশাক|গার্মেন্টস|শ্রমিক|কারখানা|রপ্তানি/i,
    queries: ['textile garment sewing factory', 'shipping cargo port containers'],
  },
  {
    pattern: /laptop|black friday|deal|retail|shopping|stock|market|inflation|bank|economy|শেয়ার|অর্থনীতি|বাজার|ব্যবসা|ব্যাংক/i,
    queries: ['stock market chart trading', 'laptop workspace technology retail'],
  },
  {
    pattern: /storm|power|outage|blackout|hurricane|flood|rain|weather|climate|ঝড়|বৃষ্টি|বন্যা|বিদ্যুৎ|আবহাওয়া/i,
    queries: ['storm dark clouds severe weather', 'electricity power lines wind'],
  },
  {
    pattern: /cricket|football|soccer|match|batting|goal|tournament|ক্রিকেট|ফুটবল|ব্যাটিং|ম্যাচ|খেলা|টুর্নামেন্ট/i,
    queries: ['cricket match stadium crowd', 'sports athlete training stadium'],
  },
  {
    pattern: /farm|crop|potato|agriculture|rice|harvest|farmer|কৃষি|ফসল|ধান|আলু|কৃষক/i,
    queries: ['agriculture farm harvest crops', 'biology laboratory plant research'],
  },
  {
    pattern: /sleep|health|hospital|doctor|medical|disease|study|স্বাস্থ্য|হাসপাতাল|চিকিৎসা|রোগ|গবেষণা/i,
    queries: ['medical research scientist laboratory', 'healthcare hospital doctor'],
  },
  {
    pattern: /court|police|arrest|violence|attack|crime|law|legal|আদালত|আইন|গ্রেপ্তার|সহিংসতা|পুলিশ|সংঘর্ষ|মামলা/i,
    queries: ['courthouse justice gavel law', 'press conference microphone briefing'],
  },
  {
    pattern: /war|border|diplomacy|london|india|pakistan|china|russia|ukraine|trump|যুদ্ধ|সীমান্ত|লন্ডন|ভারত|পাকিস্তান|যুক্তরাজ্য|আন্তর্জাতিক/i,
    queries: ['diplomacy flags international summit', 'world globe map geopolitics'],
  },
  {
    pattern: /ai|artificial intelligence|cyber|software|tech|chip|nvidia|google|apple|প্রযুক্তি|ইন্টারনেট|মোবাইল/i,
    queries: ['artificial intelligence computer server', 'software developer digital screen'],
  },
];

const UNRELATED_CITY_NOISE_RE = /\b(?:dubai|burj|skyscraper|aerial skyline)\b/i;

const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const PREFERRED_VIDEO_BYTES = 5 * 1024 * 1024;

/**
 * Fetches licensed stock B-roll MP4 clips from the Pixabay Videos API.
 */
export class PixabayVideoService {
  private apiKey: string;

  constructor() {
    this.apiKey = (config.PIXABAY_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  public static getCategoryFallbackQuery(category?: string): string {
    const key = resolveCategoryTheme(category);
    return CATEGORY_VIDEO_QUERIES[key] || 'television newsroom journalism studio';
  }

  /**
   * Derives specific English stock-video search queries from story text (Bangla or English)
   * so B-roll always matches the story topic rather than generic city skylines.
   */
  public static extractTopicVisualQueries(text?: string, category?: string): string[] {
    const combined = `${text || ''} ${category || ''}`.trim();
    const collected: string[] = [];

    for (const rule of TOPIC_VISUAL_RULES) {
      if (rule.pattern.test(combined)) {
        collected.push(...rule.queries);
      }
    }

    collected.push(PixabayVideoService.getCategoryFallbackQuery(category));
    collected.push('newsroom journalism studio broadcast');

    return Array.from(new Set(collected)).slice(0, 4);
  }

  public async fetchBackgroundVideo(options: {
    query?: string;
    category?: string;
    seedText?: string;
    outputDir: string;
  }): Promise<string | null> {
    const clips = await this.fetchBackgroundVideos({ ...options, maxClips: 1 });
    return clips[0] || null;
  }

  /**
   * Searches and downloads up to `maxClips` distinct, topic-matched Pixabay clips in parallel
   * for 3-5 second multi-cut visual pacing.
   */
  public async fetchBackgroundVideos(options: {
    queries?: string[];
    query?: string;
    category?: string;
    headline?: string;
    seedText?: string;
    outputDir: string;
    maxClips?: number;
  }): Promise<string[]> {
    if (!this.isConfigured()) return [];

    const maxClips = Math.max(1, Math.min(4, options.maxClips ?? 3));
    const sanitizeQuery = (q?: string) =>
      (q || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();

    const topicQueries = PixabayVideoService.extractTopicVisualQueries(
      `${options.headline || ''} ${options.seedText || ''}`,
      options.category
    );

    const candidateQueries = Array.from(
      new Set(
        [
          ...(options.queries || []).map(sanitizeQuery),
          sanitizeQuery(options.query),
          ...topicQueries,
        ].filter((q) => q.length >= 3)
      )
    ).slice(0, 4);

    // Query candidate topics in parallel for minimum latency
    const searchResults = await Promise.all(
      candidateQueries.map(async (q) => ({ q, hits: await this.searchVideos(q) }))
    );

    const chosenHits: Array<{ id: number; url: string }> = [];
    const seenIds = new Set<number>();

    for (const { q, hits } of searchResults) {
      if (chosenHits.length >= maxClips) break;
      if (hits.length === 0) continue;

      const selected = this.pickHit(hits, `${options.seedText || ''}_${q}`, seenIds, q);
      if (selected) {
        seenIds.add(selected.id);
        chosenHits.push(selected);
      }
    }

    // Backfill remaining slots from other hits if we need multi-cut diversity
    if (chosenHits.length < maxClips) {
      for (const { q, hits } of searchResults) {
        while (chosenHits.length < maxClips) {
          const extra = this.pickHit(hits, `${options.seedText || ''}_${q}_alt_${chosenHits.length}`, seenIds, q);
          if (!extra) break;
          seenIds.add(extra.id);
          chosenHits.push(extra);
        }
        if (chosenHits.length >= maxClips) break;
      }
    }

    if (chosenHits.length === 0) return [];

    const downloaded = await Promise.all(
      chosenHits.map((clip) => this.downloadVideo(clip.url, clip.id, options.outputDir))
    );
    return downloaded.filter((p): p is string => Boolean(p));
  }

  private async searchVideos(query: string): Promise<PixabayVideoHit[]> {
    try {
      const params = new URLSearchParams({
        key: this.apiKey,
        q: query.slice(0, 95),
        per_page: '10',
        safesearch: 'true',
      });
      const response = await fetch(`https://pixabay.com/api/videos/?${params.toString()}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) {
        console.warn(`[Pixabay] ⚠️ Video search HTTP ${response.status} for "${query}"`);
        return [];
      }
      const data = (await response.json()) as { hits?: PixabayVideoHit[] };
      return Array.isArray(data?.hits) ? data.hits : [];
    } catch (err: any) {
      console.warn(`[Pixabay] ⚠️ Video search error (${query}): ${err?.message || err}`);
      return [];
    }
  }

  private pickHit(
    hits: PixabayVideoHit[],
    seedText: string,
    excludeIds: Set<number> = new Set(),
    queryText: string = ''
  ): { id: number; url: string } | null {
    const wantsCity = UNRELATED_CITY_NOISE_RE.test(queryText);

    const mapped = hits
      .filter((hit) => !excludeIds.has(hit.id))
      .map((hit) => {
        const videoPool = [hit.videos?.tiny, hit.videos?.small, hit.videos?.medium].filter(
          (v): v is PixabayVideoFile =>
            Boolean(v?.url && (!v.size || v.size <= MAX_VIDEO_BYTES))
        );
        // Prefer fast-decoding streams under 5MB (tiny >= 480px or small <= 5MB) before heavier clips
        const preferred =
          videoPool.find((v) => (v.width || 0) >= 640 && (!v.size || v.size <= PREFERRED_VIDEO_BYTES)) ||
          videoPool.find((v) => (v.width || 0) >= 480 && (!v.size || v.size <= PREFERRED_VIDEO_BYTES)) ||
          videoPool.find((v) => (v.width || 0) >= 640) ||
          videoPool[0];
        return preferred?.url
          ? { id: hit.id, url: preferred.url, duration: hit.duration || 0, tags: hit.tags || '' }
          : null;
      })
      .filter((x): x is { id: number; url: string; duration: number; tags: string } => Boolean(x));

    if (mapped.length === 0) return null;

    // Avoid off-topic skyline/Dubai B-roll unless the story specifically calls for it
    const topicFiltered = wantsCity
      ? mapped
      : mapped.filter((v) => !UNRELATED_CITY_NOISE_RE.test(v.tags));
    const basePool = topicFiltered.length > 0 ? topicFiltered : mapped;

    const longEnough = basePool.filter((v) => v.duration >= 4);
    const pool = longEnough.length > 0 ? longEnough : basePool;
    const hash = crypto.createHash('md5').update(seedText).digest().readUInt32BE(0);
    const chosen = pool[hash % Math.min(pool.length, 6)];
    return { id: chosen.id, url: chosen.url };
  }

  private async downloadVideo(
    videoUrl: string,
    hitId: number,
    outputDir: string
  ): Promise<string | null> {
    try {
      const response = await fetch(videoUrl, {
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) return null;

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_VIDEO_BYTES) {
        console.warn(`[Pixabay] Skipping oversized clip #${hitId} (${contentLength} bytes)`);
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1024 || buffer.length > MAX_VIDEO_BYTES) {
        return null;
      }

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(
        outputDir,
        `pixabay_${hitId}_${crypto.randomBytes(4).toString('hex')}.mp4`
      );
      fs.writeFileSync(filePath, buffer);
      console.log(`[Pixabay] 🎞️ Downloaded licensed B-roll #${hitId} (${buffer.length} bytes)`);
      return filePath;
    } catch (err: any) {
      console.warn(`[Pixabay] ⚠️ Download error (#${hitId}): ${err?.message || err}`);
      return null;
    }
  }
}
