import {
  BRAND_GLYPH_PATHS,
  BRAND_GLYPH_STROKE_WIDTH,
  BRAND_GLYPH_VIEWBOX,
} from '@/lib/brand';

/**
 * The Xylar glyph on its own. Paint it with `currentColor` by placing
 * it inside a container that already sets text colour (the sidebar
 * and login wordmark use primary-foreground on a primary tile).
 */
export function XylarGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox={BRAND_GLYPH_VIEWBOX}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {BRAND_GLYPH_PATHS.map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth={BRAND_GLYPH_STROKE_WIDTH}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
