import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

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

// Ensure .tmp directory exists
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

function validateToken(req: http.IncomingMessage): boolean {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  return url.searchParams.get('token') === TOKEN;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method ?? 'GET';

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /health
  if (method === 'GET' && pathname === '/health') {
    if (!validateToken(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  // POST /generate
  if (method === 'POST' && pathname === '/generate') {
    if (!validateToken(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    let body: { image?: string; prompt?: string };
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const { image, prompt } = body;
    if (!image || !prompt) {
      sendJson(res, 400, { error: 'Missing required fields: image and prompt' });
      return;
    }

    const uuid = crypto.randomUUID();
    const inputPath = path.join(tmpDir, `${uuid}-input.png`);
    const outputPath = path.join(tmpDir, `${uuid}-output.png`);

    try {
      // Extract base64 data (strip data URL prefix if present)
      let base64Data = image;
      if (image.includes(',')) {
        base64Data = image.split(',')[1];
      }

      // Write input file
      fs.writeFileSync(inputPath, Buffer.from(base64Data, 'base64'));

      // Record newest generated image before calling codex
      const codexHome = process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex');
      const genDir = path.join(codexHome, 'generated_images');
      const beforeTs = Date.now();

      // Call codex — pass prompt via env variable to avoid shell injection
      const codexPrompt = `${prompt}。输入图片在 ${inputPath}，请基于这张图片生成新图，保存到 ${outputPath}`;
      execSync('echo "$CODEX_PROMPT" | codex exec -', {
        timeout: 600_000,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: tmpDir,
        shell: '/bin/bash',
        env: { ...process.env, CODEX_PROMPT: codexPrompt },
      });

      // Find the output image: check explicit path first, then scan codex generated_images
      let outputBuffer: Buffer;
      if (fs.existsSync(outputPath)) {
        outputBuffer = fs.readFileSync(outputPath);
      } else {
        // Codex saves to ~/.codex/generated_images/<session>/<file>.png
        // Find the newest image created after our call
        const findCmd = `find "${genDir}" -name '*.png' -newer "${inputPath}" -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-`;
        const newest = execSync(findCmd, { encoding: 'utf-8' }).trim();
        if (!newest || !fs.existsSync(newest)) {
          throw new Error('Codex did not produce an output image');
        }
        outputBuffer = fs.readFileSync(newest);
      }
      const outputBase64 = outputBuffer.toString('base64');

      sendJson(res, 200, {
        success: true,
        image: outputBase64,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: 'Generation failed', details: message });
    } finally {
      // Clean up temp files
      if (fs.existsSync(inputPath)) {
        try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
      }
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
      }
    }
    return;
  }

  // 404 for everything else
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`AI Server running at ${url}`);
  console.log(`Token: ${TOKEN}`);
  console.log(`Test command: curl "${url}/health?token=${TOKEN}"`);
});
