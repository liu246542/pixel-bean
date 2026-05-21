export interface AIServiceConfig {
  url: string;
  token: string;
}

export interface AIResult {
  success: boolean;
  image?: string;
  error?: string;
}

export const DEFAULT_PROMPT =
  '将这张图片转换为适合拼豆制作的风格：chibi art style, 纯色块, 无抗锯齿, 无渐变, 无阴影, 白色背景, 硬边缘, bold clean outlines, 颜色不超过6种且对比强烈, cartoon style';

export const DEFAULT_GENERATE_PROMPT =
  '要求：拼豆风格像素图，卡通动漫风格，无抗锯齿，无渐变，无阴影，纯色块，背景白色，颜色不超过6种且对比强烈，硬边缘，bold clean outlines，比例1:1';

const STORAGE_KEY = 'pixel-bean-ai-config';

function buildHttpUrl(base: string, token: string, path: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return `${trimmed}${path}?token=${encodeURIComponent(token)}`;
}

function buildWsUrl(base: string, token: string, path: string): string {
  const trimmed = base.replace(/\/+$/, '');
  const wsBase = trimmed.replace(/^http/, 'ws');
  return `${wsBase}${path}?token=${encodeURIComponent(token)}`;
}

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

export function saveConfig(config: AIServiceConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function healthCheck(config: AIServiceConfig): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const url = buildHttpUrl(config.url, config.token, '/health');
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

export function generateImage(
  config: AIServiceConfig,
  imageBase64: string,
  prompt: string,
  onProgress?: (text: string) => void,
): Promise<AIResult> {
  return new Promise((resolve) => {
    const url = buildWsUrl(config.url, config.token, '/generate');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      resolve({ success: false, error: 'Failed to open WebSocket' });
      return;
    }

    const timeout = setTimeout(() => {
      ws.close();
      resolve({ success: false, error: 'Timed out waiting for AI response' });
    }, 660_000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ image: imageBase64, prompt }));
      onProgress?.('已连接，等待 Codex 处理...');
    };

    ws.onmessage = (event) => {
      let msg: { type: string; text?: string; success?: boolean; image?: string; error?: string };
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (msg.type === 'progress' && msg.text) {
        onProgress?.(msg.text);
      } else if (msg.type === 'done') {
        clearTimeout(timeout);
        ws.close();
        resolve({ success: true, image: msg.image });
      } else if (msg.type === 'error') {
        clearTimeout(timeout);
        ws.close();
        resolve({ success: false, error: msg.error });
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({ success: false, error: 'WebSocket connection error' });
    };

    ws.onclose = () => {
      clearTimeout(timeout);
    };
  });
}
