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
  'cat-politics': 'government parliament building diplomacy',
  'cat-economy': 'stock market finance business city',
  'cat-international': 'world globe skyline modern city',
  'cat-sports': 'stadium sports football cricket action',
  'cat-technology': 'technology data server digital network',
  'cat-entertainment': 'cinema stage concert spotlight',
  'cat-opinion': 'newspaper press conference studio',
  'cat-religion': 'mosque architecture peaceful light',
  'cat-education': 'university campus library books',
  'cat-job': 'office workspace laptop business meeting',
  'cat-lifestyle': 'city street morning lifestyle nature',
  'cat-todays-match': 'cricket football stadium crowd',
  'cat-bangladesh': 'city traffic skyline river bridge',
};

const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const PREFERRED_VIDEO_BYTES = 6 * 1024 * 1024;

/**
 * Fetches licensed stock B-roll MP4 clips from the Pixabay Videos API.
 */
export class PixabayVideoService {
  private apiKey: string;

  constructor() {
    this.apiKey = (config.PIXABAY_API_KEY || '').trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  public static getCategoryFallbackQuery(category?: string): string {
    const key = resolveCategoryTheme(category);
    return CATEGORY_VIDEO_QUERIES[key] || 'breaking news broadcast studio city';
  }

  public async fetchBackgroundVideo(options: {
    query?: string;
    category?: string;
    seedText?: string;
    outputDir: string;
  }): Promise<string | null> {
    if (!this.isConfigured()) return null;

    const candidates = Array.from(
      new Set(
        [
          (options.query || '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim(),
          PixabayVideoService.getCategoryFallbackQuery(options.category),
          'modern city news studio motion',
        ].filter(Boolean)
      )
    );

    for (const q of candidates) {
      const hits = await this.searchVideos(q);
      if (hits.length === 0) continue;

      const selected = this.pickHit(hits, options.seedText || q);
      if (!selected) continue;

      const savedPath = await this.downloadVideo(selected.url, selected.id, options.outputDir);
      if (savedPath) {
        return savedPath;
      }
    }

    return null;
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
    seedText: string
  ): { id: number; url: string } | null {
    const valid = hits
      .map((hit) => {
        const videoPool = [hit.videos?.tiny, hit.videos?.small, hit.videos?.medium].filter(
          (v): v is PixabayVideoFile =>
            Boolean(v?.url && (!v.size || v.size <= MAX_VIDEO_BYTES))
        );
        // Prefer fast-decoding streams under 6MB (tiny >= 480px or small <= 6MB) before heavier clips
        const preferred =
          videoPool.find((v) => (v.width || 0) >= 640 && (!v.size || v.size <= PREFERRED_VIDEO_BYTES)) ||
          videoPool.find((v) => (v.width || 0) >= 480 && (!v.size || v.size <= PREFERRED_VIDEO_BYTES)) ||
          videoPool.find((v) => (v.width || 0) >= 640) ||
          videoPool[0];
        return preferred?.url ? { id: hit.id, url: preferred.url, duration: hit.duration || 0 } : null;
      })
      .filter((x): x is { id: number; url: string; duration: number } => Boolean(x));

    if (valid.length === 0) return null;

    // Prefer clips >= 4s when available and pick deterministically by article seed so reels vary.
    const longEnough = valid.filter((v) => v.duration >= 4);
    const pool = longEnough.length > 0 ? longEnough : valid;
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
