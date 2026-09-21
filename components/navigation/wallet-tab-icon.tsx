import Svg, { Path, Rect } from 'react-native-svg';

export function WalletTabIcon({ name, color }: { name: 'home' | 'send' | 'request' | 'security'; color: string }) {
  return <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}>
    {name === 'home' && <>
      <Path d="M19 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0-3 3v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2H6a2 2 0 0 1 0-4" />
      <Path d="M21 12h-5a2 2 0 0 0 0 4h5M17 14h.01" />
    </>}
    {name === 'send' && <Path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />}
    {name === 'request' && <>
      <Rect x={3} y={3} width={6} height={6} rx={1} /><Rect x={15} y={3} width={6} height={6} rx={1} />
      <Rect x={3} y={15} width={6} height={6} rx={1} /><Path d="M15 15h3v3h3M15 21h3M21 15v.01M21 21v.01" />
    </>}
    {name === 'security' && <>
      <Path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><Path d="m9 12 2 2 4-4" />
    </>}
  </Svg>;
}
