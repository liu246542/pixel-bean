// AI service configuration stored in localStorage
export interface AIServiceConfig {
  url: string;
  token: string;
}

// Result returned by the AI image generation endpoint
export interface AIResult {
  success: boolean;
  image?: string;
  error?: string;
}

// Default prompt for converting images to pixel-bean (fuse bead) style
export const DEFAULT_PROMPT =
  '将这张图片转换为适合拼豆制作的风格：chibi art style, simple flat colors, no gradients, no shading, white background, bold clean outlines, minimal detail, 4-8 distinct solid colors, cartoon style';

const STORAGE_KEY = 'pixel-bean-ai-config';

// Construct a URL with the given path and token query parameter
function buildUrl(base: string, token: string, path: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return `${trimmed}${path}?token=${encodeURIComponent(token)}`;
}

// Read the AI service configuration from localStorage
export function loadConfig(): AIServiceConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AIServiceConfig;
    if (typeof parsed.url === 'string' && typeof parsed.token === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// Persist the AI service configuration to localStorage
export function saveConfig(config: AIServiceConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// Verify connectivity to the AI service; returns true when status is 'ok'
export async function healthCheck(config: AIServiceConfig): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const url = buildUrl(config.url, config.token, '/health');
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Send an image to the AI service and return the generated result
export async function generateImage(
  config: AIServiceConfig,
  imageBase64: string,
  prompt: string,
  onProgress?: (progress: number) => void,
): Promise<AIResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 360_000);
  try {
    // Signal that work has started (0%) if a progress callback was supplied
    onProgress?.(0);
    const url = buildUrl(config.url, config.token, '/generate');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64, prompt }),
      signal: controller.signal,
    });
    // Signal that the response has arrived (100%)
    onProgress?.(100);
    const data = (await res.json()) as AIResult;
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
