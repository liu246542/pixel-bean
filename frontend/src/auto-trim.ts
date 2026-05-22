export function autoTrim(imageSrc: string, threshold = 240, padding = 2): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);

      function isBlank(x: number, y: number): boolean {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) return true;
        return r >= threshold && g >= threshold && b >= threshold;
      }

      let top = 0, bottom = height - 1, left = 0, right = width - 1;

      // Allow up to 0.5% non-blank pixels in a row/col (tolerates stray dots
      // but won't trim sparse real content like thin lines)
      const tolerance = 0.005;

      function isRowBlank(y: number): boolean {
        let nonBlank = 0;
        for (let x = 0; x < width; x++) {
          if (!isBlank(x, y)) nonBlank++;
        }
        return nonBlank / width <= tolerance;
      }

      function isColBlank(x: number, yStart: number, yEnd: number): boolean {
        let nonBlank = 0;
        const h = yEnd - yStart + 1;
        for (let y = yStart; y <= yEnd; y++) {
          if (!isBlank(x, y)) nonBlank++;
        }
        return nonBlank / h <= tolerance;
      }

      // Scan top
      for (top = 0; top < height; top++) {
        if (!isRowBlank(top)) break;
      }

      // All rows blank — nothing to trim to
      if (top >= height) { resolve(null); return; }

      // Scan bottom
      for (bottom = height - 1; bottom >= top; bottom--) {
        if (!isRowBlank(bottom)) break;
      }

      // Scan left
      for (left = 0; left < width; left++) {
        if (!isColBlank(left, top, bottom)) break;
      }

      // Scan right
      for (right = width - 1; right >= left; right--) {
        if (!isColBlank(right, top, bottom)) break;
      }

      // Add padding
      top = Math.max(0, top - padding);
      bottom = Math.min(height - 1, bottom + padding);
      left = Math.max(0, left - padding);
      right = Math.min(width - 1, right + padding);

      const tw = right - left + 1;
      const th = bottom - top + 1;

      // No significant trim possible
      if (tw >= width - 4 && th >= height - 4) {
        resolve(null);
        return;
      }

      const out = document.createElement('canvas');
      out.width = tw;
      out.height = th;
      out.getContext('2d')!.drawImage(img, left, top, tw, th, 0, 0, tw, th);
      resolve(out.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = imageSrc;
  });
}
