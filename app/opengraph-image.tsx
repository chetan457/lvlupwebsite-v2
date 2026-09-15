import { ImageResponse } from 'next/og';

import { cheapestHour } from '@/content/pricing';
import { site } from '@/content/site';
import { PixelMark } from '@/lib/pixel-mark';

export const alt = `${site.name} — ${site.tagline} in ${site.address.locality}, ${site.address.city}. From ₹${cheapestHour} an hour.`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The share card for WhatsApp, Instagram DMs and search previews, in v2's HUD
 * look. Like v1's, it fetches nothing and loads no font, so generating a link
 * preview can never fail or stall; everything is sized to survive a 200px chat
 * thumbnail — one wordmark, one line, one price.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#050608',
          // the glow the 3D scene sits in, painted on the card itself: as a separate
          // oversized box, the renderer clipped it to a hard line across the image
          backgroundImage:
            'radial-gradient(circle at 82% 22%, rgba(0,168,255,0.30) 0%, rgba(0,112,209,0.12) 30%, rgba(5,6,8,0) 60%)',
          padding: '64px 72px',
          position: 'relative',
        }}
      >
        {/* floor grid lines, receding */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 40 + i * i * 14,
              height: 1,
              backgroundColor: `rgba(0,168,255,${0.22 - i * 0.04})`,
            }}
          />
        ))}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <PixelMark size={44} />
            <div style={{ display: 'flex', marginLeft: 18, fontSize: 40, letterSpacing: '0.04em', color: '#f5f7fa' }}>
              LVL<span style={{ color: '#00a8ff' }}>UP</span>
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: '0.22em', color: '#a7b0bb' }}>
            LVL 01 / PRESS START
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 132,
              lineHeight: 0.9,
              letterSpacing: '-0.02em',
              color: '#f5f7fa',
              textTransform: 'uppercase',
            }}
          >
            <span>PS5 by</span>
            <span>the hour</span>
          </div>
          <div style={{ display: 'flex', marginTop: 24, fontSize: 30, color: '#a7b0bb' }}>
            {site.address.locality}, {site.address.city} · {site.bays} bays · {site.seats} seats
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: 26, color: '#a7b0bb', marginRight: 14, letterSpacing: '0.18em' }}>FROM</span>
            <span style={{ fontSize: 64, color: '#00a8ff' }}>₹{cheapestHour}</span>
            <span style={{ fontSize: 30, color: '#a7b0bb', marginLeft: 6 }}>/hr</span>
          </div>
          <div
            style={{
              display: 'flex',
              padding: '16px 28px',
              backgroundColor: '#0070d1',
              color: '#ffffff',
              fontSize: 26,
              letterSpacing: '0.14em',
            }}
          >
            BOOK ON WHATSAPP
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
