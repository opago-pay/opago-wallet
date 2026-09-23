import React, { useLayoutEffect, useRef } from 'react';
import QRCode from 'react-native-qrcode-svg';
import { recordPerformanceDuration } from '@/lib/performance-trace';

// Rasterized from logo_new.svg, the exact badge used in the Home header.
// The native QR renderer accepts a local image asset; it does not render a React component as logoSVG.
const opagoQrLogo = require('../../assets/images/opago-qr-logo.png');

/** Keep the payment payload intact: the logo covers only a small, correctable center area. */
export const WalletQrCode = React.memo(function WalletQrCode({ value, size, focused = true, onReady }: {
  value: string; size: number; focused?: boolean; onReady?: () => void;
}) {
  const lastRender = useRef<{ value: string; size: number; startedAt: number } | null>(null);
  if (!lastRender.current || lastRender.current.value !== value || lastRender.current.size !== size) {
    lastRender.current = { value, size, startedAt: performance.now() };
  }
  const renderStartedAt = lastRender.current.startedAt;
  useLayoutEffect(() => {
    // Includes QR matrix generation and SVG commit, without recording the payment payload.
    recordPerformanceDuration('receive.qr_render', performance.now() - renderStartedAt);
  }, [renderStartedAt]);
  useLayoutEffect(() => {
    if (!focused) return;
    const frame = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(frame);
  }, [renderStartedAt, focused, onReady]);
  return <QRCode
    value={value}
    size={size}
    ecl="H"
    color="#000000"
    backgroundColor="#ffffff"
    quietZone={Math.max(10, Math.round(size * 0.045))}
    logo={opagoQrLogo}
    logoSize={Math.round(size * 0.13)}
    logoMargin={Math.max(3, Math.round(size * 0.012))}
    logoBackgroundColor="#ffffff"
    logoBorderRadius={6}
  />;
});
