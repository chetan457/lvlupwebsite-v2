import { ImageResponse } from 'next/og';

import { PixelMark } from '@/lib/pixel-mark';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** The browser-tab icon: the pixel "L" on the room's graphite. */
export default function Icon() {
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
        }}
      >
        <PixelMark size={22} />
      </div>
    ),
    { ...size },
  );
}
