import { ImageResponse } from 'next/og';
import {
  BRAND_GLYPH_PATHS,
  BRAND_GLYPH_STROKE_WIDTH,
  BRAND_ICON_GRADIENT,
} from '@/lib/brand';

// Brand favicon: the Xylar "X" in white on the violet tile.
//
// The glyph geometry and the tile gradient come from src/lib/brand.ts
// so this route, apple-icon.tsx and the in-app logo stay in sync.
// Next.js renders this at build time and auto-injects <link rel="icon">.
export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: BRAND_ICON_GRADIENT,
        borderRadius: 8,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        {BRAND_GLYPH_PATHS.map((d) => (
          <path
            key={d}
            d={d}
            stroke="#ffffff"
            strokeWidth={BRAND_GLYPH_STROKE_WIDTH}
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>,
    { ...size }
  );
}
