const RATIOS: { label: string; value: number | null }[] = [
  { label: '自由', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
];

export function showCropModal(imageSrc: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'crop-overlay';
    overlay.innerHTML = `
      <div class="crop-modal">
        <div class="crop-header">
          <span>裁剪图片</span>
          <div class="crop-header-btns">
            <button class="btn btn--sm" data-action="cancel">取消</button>
            <button class="btn btn--sm btn--primary" data-action="confirm">确认裁剪</button>
          </div>
        </div>
        <div class="crop-ratios"></div>
        <div class="crop-body">
          <canvas></canvas>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const canvas = overlay.querySelector('canvas')!;
    const ctx = canvas.getContext('2d')!;
    const ratioBar = overlay.querySelector('.crop-ratios')!;

    let aspectRatio: number | null = null;

    // Build ratio buttons
    RATIOS.forEach((r, i) => {
      const btn = document.createElement('button');
      btn.className = 'crop-ratio-btn' + (i === 0 ? ' active' : '');
      btn.textContent = r.label;
      btn.addEventListener('click', () => {
        ratioBar.querySelectorAll('.crop-ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        aspectRatio = r.value;
        if (aspectRatio !== null) applyRatio();
        draw();
      });
      ratioBar.appendChild(btn);
    });

    const img = new Image();
    img.onload = () => setup(img);
    img.src = imageSrc;

    let bx = 0, by = 0, bw = 0, bh = 0;
    let dispW = 0, dispH = 0;

    function applyRatio() {
      if (aspectRatio === null) return;
      const centerX = bx + bw / 2;
      const centerY = by + bh / 2;

      if (bw / bh > aspectRatio) {
        bw = bh * aspectRatio;
      } else {
        bh = bw / aspectRatio;
      }

      bx = centerX - bw / 2;
      by = centerY - bh / 2;
      clampBox();
    }

    function clampBox() {
      if (bw < 0) { bx += bw; bw = -bw; }
      if (bh < 0) { by += bh; bh = -bh; }
      bw = Math.max(20, bw);
      bh = Math.max(20, bh);
      if (aspectRatio !== null) {
        bh = bw / aspectRatio;
        if (bw > dispW) { bw = dispW; bh = bw / aspectRatio; }
        if (bh > dispH) { bh = dispH; bw = bh * aspectRatio; }
      }
      bx = Math.max(0, Math.min(bx, dispW - bw));
      by = Math.max(0, Math.min(by, dispH - bh));
    }

    function draw() {
      ctx.clearRect(0, 0, dispW, dispH);
      ctx.drawImage(img, 0, 0, dispW, dispH);

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, dispW, by);
      ctx.fillRect(0, by + bh, dispW, dispH - by - bh);
      ctx.fillRect(0, by, bx, bh);
      ctx.fillRect(bx + bw, by, dispW - bx - bw, bh);

      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(bx + bw * i / 3, by); ctx.lineTo(bx + bw * i / 3, by + bh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, by + bh * i / 3); ctx.lineTo(bx + bw, by + bh * i / 3); ctx.stroke();
      }

      ctx.fillStyle = '#fff';
      for (const [cx, cy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) {
        ctx.fillRect(cx - 4, cy - 4, 8, 8);
      }
    }

    function setup(img: HTMLImageElement) {
      const maxW = Math.min(window.innerWidth - 80, 900);
      const maxH = Math.min(window.innerHeight - 200, 550);
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      dispW = Math.round(img.width * scale);
      dispH = Math.round(img.height * scale);
      canvas.width = dispW;
      canvas.height = dispH;

      bx = 0; by = 0; bw = dispW; bh = dispH;

      let dragging = false;
      let mode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'new' | null = null;
      let startX = 0, startY = 0;

      function hitTest(mx: number, my: number): typeof mode {
        const r = 12;
        if (Math.abs(mx - bx) < r && Math.abs(my - by) < r) return 'nw';
        if (Math.abs(mx - bx - bw) < r && Math.abs(my - by) < r) return 'ne';
        if (Math.abs(mx - bx) < r && Math.abs(my - by - bh) < r) return 'sw';
        if (Math.abs(mx - bx - bw) < r && Math.abs(my - by - bh) < r) return 'se';
        if (mx > bx && mx < bx + bw && my > by && my < by + bh) return 'move';
        return 'new';
      }

      function onPointerDown(mx: number, my: number) {
        mode = hitTest(mx, my);
        dragging = true;
        startX = mx; startY = my;
        if (mode === 'new') { bx = mx; by = my; bw = 0; bh = 0; }
      }

      function onPointerMove(mx: number, my: number) {
        if (!dragging || !mode) return;
        const dx = mx - startX, dy = my - startY;
        startX = mx; startY = my;

        if (mode === 'move') {
          bx += dx; by += dy;
        } else if (mode === 'se' || mode === 'new') {
          bw += dx;
          bh = aspectRatio !== null ? bw / aspectRatio : bh + dy;
        } else if (mode === 'nw') {
          bw -= dx; bx += dx;
          if (aspectRatio !== null) { const nh = bw / aspectRatio; by += bh - nh; bh = nh; }
          else { bh -= dy; by += dy; }
        } else if (mode === 'ne') {
          bw += dx;
          if (aspectRatio !== null) { const nh = bw / aspectRatio; by += bh - nh; bh = nh; }
          else { bh -= dy; by += dy; }
        } else if (mode === 'sw') {
          bw -= dx; bx += dx;
          bh = aspectRatio !== null ? bw / aspectRatio : bh + dy;
        }

        clampBox();
        draw();
      }

      function onPointerUp() { dragging = false; mode = null; }

      canvas.addEventListener('mousedown', (e) => {
        const r = canvas.getBoundingClientRect();
        onPointerDown(e.clientX - r.left, e.clientY - r.top);
      });
      canvas.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        if (!dragging) {
          const h = hitTest(mx, my);
          canvas.style.cursor = h === 'move' ? 'grab' : h === 'new' ? 'crosshair'
            : (h === 'nw' || h === 'se') ? 'nwse-resize' : 'nesw-resize';
          return;
        }
        onPointerMove(mx, my);
      });
      canvas.addEventListener('mouseup', onPointerUp);
      canvas.addEventListener('mouseleave', onPointerUp);

      canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0], r = canvas.getBoundingClientRect();
        onPointerDown(t.clientX - r.left, t.clientY - r.top);
      }, { passive: false });
      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.touches[0], r = canvas.getBoundingClientRect();
        onPointerMove(t.clientX - r.left, t.clientY - r.top);
      }, { passive: false });
      canvas.addEventListener('touchend', onPointerUp);

      draw();
    }

    function cleanup() { document.body.removeChild(overlay); }

    overlay.querySelector('[data-action="cancel"]')!.addEventListener('click', () => {
      cleanup(); resolve(null);
    });

    overlay.querySelector('[data-action="confirm"]')!.addEventListener('click', () => {
      const scaleX = img.width / dispW;
      const scaleY = img.height / dispH;
      const sx = Math.round(bx * scaleX);
      const sy = Math.round(by * scaleY);
      const sw = Math.round(bw * scaleX);
      const sh = Math.round(bh * scaleY);

      const out = document.createElement('canvas');
      out.width = sw;
      out.height = sh;
      out.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      cleanup();
      resolve(out.toDataURL('image/png'));
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { cleanup(); resolve(null); }
    });
  });
}
