import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Print geometry (§32/§6a): 200mm trim + 3mm bleed per edge. */
export const PRINT = {
  PAGE_MM: 206,
  TRIM_MM: 200,
  BLEED_MM: 3,
  SAFE_MARGIN_MM: 14,
  DPI: 300,
  /** 206mm at 300 DPI. */
  PRINT_PIXELS: 2433,
  PREVIEW_PIXELS: 1000,
} as const;

export interface TemplatePage {
  kind: 'cover' | 'dedication' | 'story' | 'back';
  layout?: 'IMAGE_TOP' | 'IMAGE_FULL' | 'TEXT_ONLY';
  text?: string;
  /** Base64 data URI, already sized for the render target. */
  imageDataUri?: string;
  title?: string;
  subtitle?: string;
  pageNumber?: number;
}

const FONT_DIR = join(__dirname, '..', '..', '..', 'assets', 'fonts');

function fontFace(family: string, file: string, weight: number): string {
  const data = readFileSync(join(FONT_DIR, file)).toString('base64');
  return `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(data:font/ttf;base64,${data}) format('truetype'); }`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}|\n/)
    .filter((part) => part.trim().length > 0)
    .map((part) => `<p>${escapeHtml(part.trim())}</p>`)
    .join('');
}

/**
 * Self-contained print HTML (§6a): local @font-face (no network), exact
 * physical page size via @page, full-bleed backgrounds, text kept inside the
 * safe margin. Chromium's pdf() with preferCSSPageSize turns this into the
 * print file.
 */
export function buildBookHtml(pages: TemplatePage[]): string {
  const css = `
    ${fontFace('Fraunces', 'Fraunces_400Regular.ttf', 400)}
    ${fontFace('Fraunces', 'Fraunces_600SemiBold.ttf', 600)}
    ${fontFace('Nunito', 'Nunito_400Regular.ttf', 400)}
    ${fontFace('Nunito', 'Nunito_600SemiBold.ttf', 600)}
    ${fontFace('Nunito', 'Nunito_800ExtraBold.ttf', 800)}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: ${PRINT.PAGE_MM}mm ${PRINT.PAGE_MM}mm; margin: 0; }
    body { font-family: 'Nunito', sans-serif; }
    .page {
      position: relative; width: ${PRINT.PAGE_MM}mm; height: ${PRINT.PAGE_MM}mm;
      overflow: hidden; page-break-after: always; background: #FAF8F4;
    }
    .page:last-child { page-break-after: auto; }
    .bleed-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .safe { position: absolute; inset: ${PRINT.SAFE_MARGIN_MM}mm; }
    .cover-scrim {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(13,27,46,0) 45%, rgba(13,27,46,0.72) 100%);
    }
    .cover-block { position: absolute; left: ${PRINT.SAFE_MARGIN_MM}mm; right: ${PRINT.SAFE_MARGIN_MM}mm; bottom: ${PRINT.SAFE_MARGIN_MM}mm; color: #FFF9F2; }
    .cover-title { font-family: 'Fraunces', serif; font-weight: 600; font-size: 46pt; line-height: 1.12; }
    .cover-subtitle { font-size: 14pt; font-weight: 600; margin-top: 6mm; opacity: 0.92; }
    .cover-plain { background: linear-gradient(160deg, #2D1B69 0%, #7C5CBF 55%, #B09CE0 100%); }
    .dedication { display: flex; align-items: center; justify-content: center; text-align: center; }
    .dedication p { font-family: 'Fraunces', serif; font-style: italic; font-size: 17pt; line-height: 1.7; color: #5A4190; max-width: 70%; margin: 0 auto; }
    .story-image-top .image-area { position: absolute; top: 0; left: 0; right: 0; height: 58%; }
    .story-image-top .image-area img { width: 100%; height: 100%; object-fit: cover; }
    .story-image-top .text-area { position: absolute; top: 58%; left: 0; right: 0; bottom: 0; padding: 8mm ${PRINT.SAFE_MARGIN_MM}mm ${PRINT.SAFE_MARGIN_MM}mm; }
    .story-text p { font-size: 13.5pt; line-height: 1.75; color: #2C2825; margin-bottom: 4mm; }
    .text-only .text-area { position: absolute; inset: ${PRINT.SAFE_MARGIN_MM}mm; display: flex; flex-direction: column; justify-content: center; }
    .text-only .story-text p { font-size: 15pt; line-height: 1.9; }
    .image-full-caption {
      position: absolute; left: ${PRINT.SAFE_MARGIN_MM}mm; right: ${PRINT.SAFE_MARGIN_MM}mm; bottom: ${PRINT.SAFE_MARGIN_MM}mm;
      background: rgba(255,249,242,0.92); border-radius: 5mm; padding: 6mm;
    }
    .image-full-caption p { font-size: 12.5pt; line-height: 1.6; color: #2C2825; }
    .page-number { position: absolute; bottom: 6mm; right: ${PRINT.SAFE_MARGIN_MM}mm; font-size: 10pt; color: #8A7D72; }
    .back { background: linear-gradient(160deg, #2D1B69 0%, #0D1B2E 100%); }
    .back .safe { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #E8E0D4; }
    .back p { font-family: 'Fraunces', serif; font-style: italic; font-size: 14pt; line-height: 1.8; max-width: 75%; }
    .back .wordmark { font-family: 'Fraunces', serif; font-weight: 600; font-size: 16pt; margin-top: 14mm; color: #B09CE0; }
  `;

  const body = pages.map((page) => renderPage(page)).join('\n');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}

function renderPage(page: TemplatePage): string {
  switch (page.kind) {
    case 'cover': {
      const image = page.imageDataUri
        ? `<img class="bleed-image" src="${page.imageDataUri}" alt=""><div class="cover-scrim"></div>`
        : '';
      return `<div class="page ${page.imageDataUri ? '' : 'cover-plain'}">${image}
        <div class="cover-block">
          <div class="cover-title">${escapeHtml(page.title ?? '')}</div>
          ${page.subtitle ? `<div class="cover-subtitle">${escapeHtml(page.subtitle)}</div>` : ''}
        </div></div>`;
    }
    case 'dedication':
      return `<div class="page dedication"><div class="safe"><p>${escapeHtml(page.text ?? '')}</p></div></div>`;
    case 'story': {
      const num = page.pageNumber != null ? `<div class="page-number">${page.pageNumber}</div>` : '';
      if (page.layout === 'IMAGE_FULL' && page.imageDataUri) {
        return `<div class="page"><img class="bleed-image" src="${page.imageDataUri}" alt="">
          ${page.text ? `<div class="image-full-caption"><div class="story-text">${paragraphs(page.text)}</div></div>` : ''}${num}</div>`;
      }
      if (page.layout !== 'TEXT_ONLY' && page.imageDataUri) {
        return `<div class="page story-image-top">
          <div class="image-area"><img src="${page.imageDataUri}" alt=""></div>
          <div class="text-area"><div class="story-text">${paragraphs(page.text ?? '')}</div></div>${num}</div>`;
      }
      return `<div class="page text-only"><div class="text-area"><div class="story-text">${paragraphs(page.text ?? '')}</div></div>${num}</div>`;
    }
    case 'back':
      return `<div class="page back"><div class="safe">
        ${page.text ? `<p>${escapeHtml(page.text)}</p>` : ''}
        <div class="wordmark">Masalım ✨</div></div></div>`;
  }
}
