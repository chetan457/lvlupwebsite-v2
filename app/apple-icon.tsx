import { ImageResponse } from 'next/og';

import { PixelMark } from '@/lib/pixel-mark';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** The home-screen icon on iOS. iOS rounds the corners itself, so the square is full bleed. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#050608',
          backgroundImage: 'radial-gradient(circle at 70% 30%, rgba(0,168,255,0.28) 0%, rgba(0,168,255,0) 60%)',
        }}
      >
        <PixelMark size={96} />
      </div>
    ),
    { ...size },
  );
}
