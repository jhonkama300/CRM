/**
 * Brand identity constants shared by the in-app logo and the
 * generated favicon / touch icon.
 *
 * The glyph is an X — the initial of Xylar — drawn with round caps
 * so it reads as a brand mark rather than a close button. Keeping the
 * path data here means the sidebar logo, the login wordmark and the
 * favicon can never drift apart.
 */

export const BRAND_NAME = 'Xylar';

/**
 * Strokes in a 24x24 viewBox. Each path is drawn with `currentColor`
 * and a round cap, so consumers decide the stroke weight by scaling
 * the `<svg>` and the colour by their own text colour.
 */
export const BRAND_GLYPH_PATHS = [
  'M6.5 6.5L17.5 17.5',
  'M17.5 6.5L6.5 17.5',
] as const;

export const BRAND_GLYPH_VIEWBOX = '0 0 24 24';
export const BRAND_GLYPH_STROKE_WIDTH = 3;

/**
 * Tile gradient for the generated icons. Hard-coded because a PNG
 * favicon is rendered outside the document and cannot resolve the
 * `--primary` CSS variable. Mirrors the violet default accent.
 */
export const BRAND_ICON_GRADIENT =
  'linear-gradient(145deg, #a78bfa 0%, #7c3aed 42%, #5b21b6 100%)';
