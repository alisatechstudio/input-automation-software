export interface TtsHttpRequest {
  providerName: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs?: number;
  successDetail?: string;
}

/**
 * Executes a JSON-to-audio POST request with timeout handling and minimum buffer validation.
 */
export async function postTtsAudioRequest(req: TtsHttpRequest): Promise<Buffer | null> {
  try {
    const response = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(req.timeoutMs ?? 15000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(
        `[${req.providerName}] ⚠️ HTTP ${response.status}: ${errText.slice(0, 240) || response.statusText}`
      );
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 500) {
      const detail = req.successDetail ? `, ${req.successDetail}` : '';
      console.log(`[${req.providerName}] ✅ Voiceover generated successfully (${buffer.length} bytes${detail})`);
      return buffer;
    }

    console.warn(`[${req.providerName}] Returned buffer too small (${buffer.length} bytes)`);
    return null;
  } catch (err: any) {
    console.warn(`[${req.providerName}] ⚠️ Synthesis error: ${err?.message || err}`);
    return null;
  }
}
