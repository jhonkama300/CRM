import { ImageResponse } from 'next/og';
import {
  BRAND_GLYPH_PATHS,
  BRAND_GLYPH_STROKE_WIDTH,
  BRAND_ICON_GRADIENT,
} from '@/lib/brand';

// iOS home-screen icon. Kept full-bleed and square on purpose: iOS
// applies its own squircle mask, so baking rounded corners in here
// would leave light seams at the corners.
export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: BRAND_ICON_GRADIENT,
      }}
    >
      <svg width="124" height="124" viewBox="0 0 24 24" fill="none">
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
