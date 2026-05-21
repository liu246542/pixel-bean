import { jsPDF } from 'jspdf';
import type { MappedPixel, ColorSystem } from './types';
import { TRANSPARENT_KEY } from './types';
import { getDisplayKey, getContrastColor } from './palette';
import { splitBoards, extractBoard } from './board-split';

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function exportPdf(
  grid: MappedPixel[][],
  system: ColorSystem,
  filename = 'pixel-bean-pattern.pdf',
  boardSize?: number
): void {
  const rows = grid.length;
  if (rows === 0) return;
  const cols = grid[0].length;
  if (cols === 0) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  // ── Page 1: Overview ──────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.text('Pixel Bean — Bead Pattern', margin, margin + 4);
  doc.setFontSize(8);
  doc.text(`${cols} x ${rows}  |  ${system}`, margin, margin + 9);

  const overviewW = pageW - margin * 2;
  const overviewH = pageH - margin * 2 - 15;
  const cellOverview = Math.min(overviewW / cols, overviewH / rows);
  const ox = margin + (overviewW - cols * cellOverview) / 2;
  const oy = margin + 15;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const isBlank = cell.isExternal || cell.paletteId === TRANSPARENT_KEY;
      const hex = isBlank ? '#FFFFFF' : rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      const [cr, cg, cb] = isBlank ? [255, 255, 255] : [cell.color.r, cell.color.g, cell.color.b];

      doc.setFillColor(cr, cg, cb);
      doc.rect(ox + c * cellOverview, oy + r * cellOverview, cellOverview, cellOverview, 'F');

      if (!isBlank) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.rect(ox + c * cellOverview, oy + r * cellOverview, cellOverview, cellOverview, 'S');
      }

      if (!isBlank && cellOverview >= 3) {
        const key = getDisplayKey(hex, system);
        const contrast = getContrastColor(hex);
        const [tr, tg, tb] = contrast === '#000000' ? [0, 0, 0] : [255, 255, 255];
        doc.setTextColor(tr, tg, tb);
        doc.setFontSize(Math.min(6, cellOverview * 0.6));
        doc.text(key, ox + c * cellOverview + cellOverview / 2, oy + r * cellOverview + cellOverview / 2 + 0.5, { align: 'center' });
      }
    }
  }

  // Column numbers
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(4);
  for (let c = 0; c < cols; c++) {
    if (cellOverview < 2 && c % 5 !== 0) continue;
    doc.text(String(c + 1), ox + c * cellOverview + cellOverview / 2, oy - 1, { align: 'center' });
  }
  // Row numbers
  for (let r = 0; r < rows; r++) {
    if (cellOverview < 2 && r % 5 !== 0) continue;
    doc.text(String(r + 1), ox - 1, oy + r * cellOverview + cellOverview / 2 + 0.3, { align: 'right' });
  }

  // ── Board detail pages (if board splitting enabled) ────────────────────────
  if (boardSize && boardSize > 0) {
    const boards = splitBoards(rows, cols, boardSize);
    for (const board of boards) {
      doc.addPage();
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Board ${board.label}  (${board.cols}×${board.rows})`, margin, margin + 4);

      const sub = extractBoard(grid, board);
      const detailW = pageW - margin * 2;
      const detailH = pageH - margin * 2 - 10;
      const detailCell = Math.min(detailW / board.cols, detailH / board.rows);
      const dx = margin + (detailW - board.cols * detailCell) / 2;
      const dy = margin + 10;

      for (let r = 0; r < board.rows; r++) {
        for (let c = 0; c < board.cols; c++) {
          const cell = sub[r][c];
          const isBlank = cell.isExternal || cell.paletteId === TRANSPARENT_KEY;
          const [cr, cg, cb] = isBlank ? [255, 255, 255] : [cell.color.r, cell.color.g, cell.color.b];
          const hex = isBlank ? '#FFFFFF' : rgbToHex(cr, cg, cb);

          doc.setFillColor(cr, cg, cb);
          doc.rect(dx + c * detailCell, dy + r * detailCell, detailCell, detailCell, 'F');
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.1);
          doc.rect(dx + c * detailCell, dy + r * detailCell, detailCell, detailCell, 'S');

          if (!isBlank && detailCell >= 4) {
            const key = getDisplayKey(hex, system);
            const contrast = getContrastColor(hex);
            const [tr, tg, tb] = contrast === '#000000' ? [0, 0, 0] : [255, 255, 255];
            doc.setTextColor(tr, tg, tb);
            doc.setFontSize(Math.min(7, detailCell * 0.55));
            doc.text(key, dx + c * detailCell + detailCell / 2, dy + r * detailCell + detailCell / 2 + 0.5, { align: 'center' });
          }
        }
      }

      // Row/col numbers
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(4);
      for (let c = 0; c < board.cols; c++) {
        doc.text(String(c + 1), dx + c * detailCell + detailCell / 2, dy - 1, { align: 'center' });
      }
      for (let r = 0; r < board.rows; r++) {
        doc.text(String(r + 1), dx - 1, dy + r * detailCell + detailCell / 2 + 0.3, { align: 'right' });
      }
    }
  }

  // ── Color legend / bead list ──────────────────────────────────────────────
  doc.addPage();
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Color Legend — Bead Usage', margin, margin + 4);

  const counts: Record<string, { hex: string; r: number; g: number; b: number; count: number }> = {};
  let total = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) continue;
      const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      if (!counts[hex]) counts[hex] = { hex, r: cell.color.r, g: cell.color.g, b: cell.color.b, count: 0 };
      counts[hex].count++;
      total++;
    }
  }

  const sorted = Object.values(counts).sort((a, b) => b.count - a.count);

  const rowH = 5;
  const startY = margin + 10;
  const colX = [margin, margin + 8, margin + 30, margin + 65, margin + 95];

  // Header
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text('Color', colX[0], startY);
  doc.text('Key', colX[1], startY);
  doc.text('Hex', colX[2], startY);
  doc.text('Count', colX[3], startY);
  doc.text('%', colX[4], startY);

  doc.setLineWidth(0.2);
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, startY + 1.5, pageW - margin, startY + 1.5);

  function drawLegendHeader(atY: number): number {
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text('Color', colX[0], atY);
    doc.text('Key', colX[1], atY);
    doc.text('Hex', colX[2], atY);
    doc.text('Count', colX[3], atY);
    doc.text('%', colX[4], atY);
    doc.setLineWidth(0.2);
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, atY + 1.5, pageW - margin, atY + 1.5);
    return atY + rowH;
  }

  let y = startY + rowH;
  for (const entry of sorted) {
    if (y > pageH - margin - 10) {
      doc.addPage();
      y = drawLegendHeader(margin + 5);
    }

    const key = getDisplayKey(entry.hex, system);
    const pct = ((entry.count / total) * 100).toFixed(1);

    doc.setFillColor(entry.r, entry.g, entry.b);
    doc.rect(colX[0], y - 3, 5, 4, 'F');
    doc.setDrawColor(180, 180, 180);
    doc.rect(colX[0], y - 3, 5, 4, 'S');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7);
    doc.text(key, colX[1], y);
    doc.text(entry.hex.toLowerCase(), colX[2], y);
    doc.text(String(entry.count), colX[3], y);
    doc.text(`${pct}%`, colX[4], y);

    y += rowH;
  }

  // Footer: totals
  y += 2;
  doc.setLineWidth(0.2);
  doc.line(margin, y - 2, pageW - margin, y - 2);
  doc.setFontSize(8);
  doc.text(`Total: ${sorted.length} colors, ${total} beads`, margin, y + 2);

  doc.save(filename);
}
