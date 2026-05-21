import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
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

let queue: Promise<void> = Promise.resolve();

function send(ws: WebSocket, msg: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (!validateTokenFromUrl(url)) {
    ws.send(JSON.stringify({ type: 'error', error: 'Unauthorized' }));
    return;
  }

  let received = false;
  let aborted = false;
  let activeChild: ChildProcess | null = null;

  // HIGH #5: Kill codex if frontend disconnects
  ws.on('close', () => {
    aborted = true;
    if (activeChild) {
      activeChild.kill('SIGTERM');
      activeChild = null;
    }
  });

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

    const queueHeartbeat = setInterval(() => {
      send(ws, { type: 'progress', text: '排队中...' });
    }, 20_000);

    // HIGH #4: Queue with catch to prevent poisoning
    queue = queue
      .catch(() => {})
      .then(async () => {
        clearInterval(queueHeartbeat);
        if (aborted || ws.readyState !== WebSocket.OPEN) return;
        send(ws, { type: 'progress', text: '开始处理...' });
        await handleGenerate(ws, image, prompt, (child) => { activeChild = child; }, () => aborted);
      })
      .catch((err) => {
        console.error('Queue job error:', err);
        send(ws, { type: 'error', error: 'Internal error' });
      })
      .finally(() => {
        clearInterval(queueHeartbeat);
      });

    send(ws, { type: 'progress', text: '排队中，请稍候...' });
  });
});

// ── History management ─────────────────────────────────────────────────────

const MAX_HISTORY = 50;

function pruneHistory(): void {
  try {
    const files = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('history-') && f.endsWith('.png'))
      .sort()
      .reverse();
    for (let i = MAX_HISTORY; i < files.length; i++) {
      fs.unlinkSync(path.join(tmpDir, files[i]));
    }
  } catch {}
}

// ── Image generation ───────────────────────────────────────────────────────

async function handleGenerate(
  ws: WebSocket,
  image: string,
  prompt: string,
  onChild: (child: ChildProcess) => void,
  isAborted: () => boolean
): Promise<void> {
  const uuid = crypto.randomUUID();
  const inputPath = path.join(tmpDir, `${uuid}-input.png`);
  const outputPath = path.join(tmpDir, `${uuid}-output.png`);
  const markerPath = path.join(tmpDir, `${uuid}-marker`);
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let outputBuffer: Buffer | null = null;
  let codexLog = '';

  try {
    if (isAborted()) return;

    const hasImage = !!image;
    const codexHome = process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex');
    const genDir = path.join(codexHome, 'generated_images');

    fs.writeFileSync(markerPath, '');

    let codexPrompt: string;

    if (hasImage) {
      send(ws, { type: 'progress', text: '准备图片...' });
      const base64Data = image.includes(',') ? image.split(',')[1] : image;
      fs.writeFileSync(inputPath, Buffer.from(base64Data, 'base64'));
      codexPrompt = `${prompt}。输入图片在 ${inputPath}，请基于这张图片生成一张新图片`;
    } else {
      send(ws, { type: 'progress', text: '准备生成图片...' });
      codexPrompt = `${prompt}。请生成一张图片`;
    }

    heartbeat = setInterval(() => {
      send(ws, { type: 'progress', text: '处理中...' });
    }, 20_000);

    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (isAborted()) return;

      if (attempt > 1) {
        // Reset marker for retry
        fs.writeFileSync(markerPath, '');
        const delay = attempt * 5_000;
        send(ws, { type: 'progress', text: `第 ${attempt - 1} 次失败，${delay / 1000}秒后重试 (${attempt}/${MAX_ATTEMPTS})...` });
        await new Promise(r => setTimeout(r, delay));
        if (isAborted()) return;
      }

      send(ws, { type: 'progress', text: attempt === 1 ? '正在调用 Codex 生成图片...' : `重试中 (${attempt}/${MAX_ATTEMPTS})...` });
      codexLog = '';

      // Spawn codex, pipe prompt via stdin
      const exitOk = await new Promise<boolean>((resolve, reject) => {
        let settled = false;
        let timedOut = false;

        const child = spawn('codex', ['exec', '-'], {
          cwd: tmpDir,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        onChild(child);
        child.stdin.end(codexPrompt);

        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          // Don't resolve here — wait for 'close' event
        }, 600_000);

        const MAX_LOG = 64_000;

        child.stdout.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          codexLog = (codexLog + text).slice(-MAX_LOG);
          for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && trimmed.length > 2) {
              send(ws, { type: 'progress', text: trimmed.slice(0, 200) });
            }
          }
        });

        child.stderr.on('data', (chunk: Buffer) => {
          codexLog = (codexLog + chunk.toString()).slice(-MAX_LOG);
        });

        function settle(ok: boolean): void {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          onChild(null as unknown as ChildProcess);
          if (isAborted()) { reject(new Error('Aborted')); return; }
          resolve(ok);
        }

        child.on('close', (code) => {
          settle(!timedOut && (code === 0 || code === null));
        });

        child.on('error', () => {
          settle(false);
        });
      });

      if (isAborted()) return;

      // Try to find the output image
      send(ws, { type: 'progress', text: '正在读取生成的图片...' });

      if (fs.existsSync(outputPath)) {
        outputBuffer = fs.readFileSync(outputPath);
      } else {
        const findCmd = `find "${genDir}" -name '*.png' -newer "${markerPath}" -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-`;
        const newest = execSync(findCmd, { encoding: 'utf-8' }).trim();
        if (newest && fs.existsSync(newest)) {
          outputBuffer = fs.readFileSync(newest);
        }
      }

      if (outputBuffer) break;

      console.error(`Attempt ${attempt}/${MAX_ATTEMPTS} failed. Exit OK: ${exitOk}. Log:\n`, codexLog.slice(-2000));

      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`Codex 生成失败，已重试 ${MAX_ATTEMPTS} 次`);
      }
    }

    const outputBase64 = outputBuffer!.toString('base64');
    send(ws, { type: 'done', success: true, image: outputBase64 });
  } catch (err) {
    if (isAborted()) return;
    const message = err instanceof Error ? err.message : String(err);
    if (codexLog) console.error('Codex failed. Log:\n', codexLog.slice(-2000));
    send(ws, { type: 'error', error: message });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    try { if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath); } catch {}
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
    try {
      if (outputBuffer) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(path.join(tmpDir, `history-${ts}.png`), outputBuffer);
      }
    } catch {}
    pruneHistory();
  }
}

// ── Start ──────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`AI Server running at http://localhost:${PORT}`);
  console.log(`  Health: GET /health?token=...`);
  console.log(`  Generate: WebSocket /generate?token=...`);
  console.log(`Token: ${TOKEN}`);
});
