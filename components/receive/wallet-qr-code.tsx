import React, { useLayoutEffect, useRef } from 'react';
import { Image, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { recordPerformanceDuration } from '@/lib/performance-trace';
import { PaymentNetworkIcon, type PaymentNetworkIconName } from './payment-network-icon';

// Rasterized from logo_new.svg, the exact badge used in the Home header.
// It remains the fallback for QR codes without an explicit payment-network brand.
const opagoQrLogo = require('../../assets/images/opago-qr-logo.png');
const QR_LOGO_BACKGROUND = '#ffffff';

export type WalletQrLogo = PaymentNetworkIconName | 'opago';

/** Keep the payment payload intact: the logo covers only a small, correctable center area. */
export const WalletQrCode = React.memo(function WalletQrCode({ value, size, focused = true, onReady, logo = 'opago' }: {
  value: string; size: number; focused?: boolean; onReady?: () => void; logo?: WalletQrLogo;
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
  const logoSize = Math.round(size * 0.15);
  const logoMargin = Math.max(3, Math.round(size * 0.012));
  const logoBoxSize = logoSize + logoMargin * 2;
  return <View style={{ width: size, height: size }}>
    <QRCode
      value={value}
      size={size}
      ecl="H"
      color="#000000"
      backgroundColor="#ffffff"
      quietZone={Math.max(10, Math.round(size * 0.045))}
    />
    <View
      pointerEvents="none"
      accessible={false}
      style={{
        position: 'absolute',
        left: (size - logoBoxSize) / 2,
        top: (size - logoBoxSize) / 2,
        width: logoBoxSize,
        height: logoBoxSize,
        padding: logoMargin,
        borderRadius: logo === 'opago' ? 8 : logoBoxSize / 2,
        backgroundColor: QR_LOGO_BACKGROUND,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {logo === 'opago'
        ? <Image source={opagoQrLogo} resizeMode="contain" style={{ width: logoSize, height: logoSize, borderRadius: 6 }} />
        : <PaymentNetworkIcon network={logo} size={logoSize} accessible={false} />}
    </View>
  </View>;
});
