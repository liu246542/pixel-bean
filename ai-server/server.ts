import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file if present (simple key=value parsing, no dependency needed)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const PORT = parseInt(process.env.PORT ?? '3456', 10);
const TOKEN = process.env.TOKEN ?? 'changeme';

const tmpDir = path.join(__dirname, '.tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function validateTokenFromUrl(url: URL): boolean {
  return url.searchParams.get('token') === TOKEN;
}

// ── HTTP server (health check only) ────────────────────────────────────────

const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === 'GET' && url.pathname === '/health') {
    if (!validateTokenFromUrl(url)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  sendJson(res, 404, { error: 'Not found. Image generation uses WebSocket on /generate' });
});

// ── WebSocket server (image generation) ────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/generate' });

// Simple queue: only one codex process at a time
let queue: Promise<void> = Promise.resolve();

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (!validateTokenFromUrl(url)) {
    ws.send(JSON.stringify({ type: 'error', error: 'Unauthorized' }));
    return;
  }

  let received = false;

  ws.on('message', (data: Buffer) => {
    if (received) return;
    received = true;

    let parsed: { image?: string; prompt?: string };
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }

    const { image, prompt } = parsed;
    if (!prompt) {
      ws.send(JSON.stringify({ type: 'error', error: 'Missing prompt' }));
      return;
    }

    queue = queue.then(() => {
      send(ws, { type: 'progress', text: '开始处理...' });
      return handleGenerate(ws, image, prompt);
    });
    send(ws, { type: 'progress', text: '排队中，请稍候...' });
  });
});

function send(ws: WebSocket, msg: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function handleGenerate(ws: WebSocket, image: string, prompt: string): Promise<void> {
  const uuid = crypto.randomUUID();
  const inputPath = path.join(tmpDir, `${uuid}-input.png`);
  const outputPath = path.join(tmpDir, `${uuid}-output.png`);

  try {
    const hasImage = !!image;
    const codexHome = process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex');
    const genDir = path.join(codexHome, 'generated_images');

    // Create a timestamp marker for find -newer (used when codex saves elsewhere)
    const markerPath = path.join(tmpDir, `${uuid}-marker`);
    fs.writeFileSync(markerPath, '');

    let codexPrompt: string;

    if (hasImage) {
      send(ws, { type: 'progress', text: '准备图片...' });
      const base64Data = image.includes(',') ? image.split(',')[1] : image;
      fs.writeFileSync(inputPath, Buffer.from(base64Data, 'base64'));
      codexPrompt = `${prompt}。输入图片在 ${inputPath}，请基于这张图片生成新图，保存到 ${outputPath}`;
    } else {
      send(ws, { type: 'progress', text: '准备生成图片...' });
      codexPrompt = `${prompt}。请生成一张图片，保存到 ${outputPath}`;
    }

    send(ws, { type: 'progress', text: '正在调用 Codex 生成图片...' });

    // Spawn codex as child process to stream output
    await new Promise<void>((resolve, reject) => {
      const child = spawn('/bin/bash', ['-c', 'echo "$CODEX_PROMPT" | codex exec -'], {
        cwd: tmpDir,
        env: { ...process.env, CODEX_PROMPT: codexPrompt },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Codex timed out after 10 minutes'));
      }, 600_000);

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && trimmed.length > 2) {
            send(ws, { type: 'progress', text: trimmed.slice(0, 200) });
          }
        }
      });

      child.stderr.on('data', () => {});

      child.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    send(ws, { type: 'progress', text: '正在读取生成的图片...' });

    // Find the output image
    let outputBuffer: Buffer;
    if (fs.existsSync(outputPath)) {
      outputBuffer = fs.readFileSync(outputPath);
    } else {
      const findCmd = `find "${genDir}" -name '*.png' -newer "${markerPath}" -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-`;
      const newest = execSync(findCmd, { encoding: 'utf-8' }).trim();
      if (!newest || !fs.existsSync(newest)) {
        throw new Error('Codex did not produce an output image');
      }
      outputBuffer = fs.readFileSync(newest);
    }

    const outputBase64 = outputBuffer.toString('base64');
    send(ws, { type: 'done', success: true, image: outputBase64 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(ws, { type: 'error', error: message });
  } finally {
    try { if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath); } catch {}
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
    // Don't close WebSocket from server — let client close after receiving
    // the done/error message. This prevents data loss through reverse proxies.
  }
}

// ── Start ──────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`AI Server running at http://localhost:${PORT}`);
  console.log(`  Health: GET /health?token=...`);
  console.log(`  Generate: WebSocket /generate?token=...`);
  console.log(`Token: ${TOKEN}`);
});
