import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/lib/i18n';
import { scannerStyles as styles } from './scanner-styles';

export function ScannerShade() {
  return <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none" accessible={false}>
    <Defs><LinearGradient id="scannerShade" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor="#050507" stopOpacity={0.94} />
      <Stop offset="0.24" stopColor="#050507" stopOpacity={0.62} />
      <Stop offset="0.48" stopColor="#050507" stopOpacity={0.25} />
      <Stop offset="0.76" stopColor="#050507" stopOpacity={0.85} />
      <Stop offset="1" stopColor="#09090b" stopOpacity={1} />
    </LinearGradient></Defs><Rect width="100%" height="100%" fill="url(#scannerShade)" />
  </Svg>;
}

/** The same recognized-scanner scene behind every subsequent payment sheet.
 * No live camera, payment data or interactive controls belong in this backdrop. */
export function ScannerSuccessBackground() {
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const finderSize = Math.min(264, width - 72, Math.max(120, (height - insets.top - insets.bottom - 300) * 0.8));
  return <View style={styles.screen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <ScannerShade />
    <ScrollView scrollEnabled={false} style={styles.screenContent}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('Send Bitcoin')}</Text>
        <View style={styles.circle}><Ionicons name="close" size={22} color="#f9f9fa" /></View>
      </View>
      <Text style={styles.prompt}>{t('Hold the QR code inside the frame.')}</Text>
      <View style={styles.stage}>
        <View style={{ width: finderSize, height: finderSize }}>
          <View style={styles.finderStatus}>
            <View style={styles.check}><Ionicons name="checkmark" size={25} color="#0a251b" /></View>
            <Text style={styles.foundText}>{t('Code recognized')}</Text>
          </View>
          {[styles.topLeft, styles.topRight, styles.bottomLeft, styles.bottomRight].map((corner, i) =>
            <View key={i} style={[styles.corner, corner, { borderColor: '#8de4bd' }]} />)}
        </View>
      </View>
      {/* Preserve the original scene's layout below the frame, behind the sheet. */}
      <View style={styles.bottom}>
        <View style={[styles.dock, fontScale > 1.5 && styles.dockStack]}>
          <View style={styles.dockButton}><Ionicons name="clipboard-outline" size={19} color="#ffb000" /><Text style={styles.dockText}>{t('Paste')}</Text></View>
          <View style={fontScale > 1.5 ? styles.dividerHorizontal : styles.divider} />
          <View style={styles.dockButton}><Ionicons name="create-outline" size={19} color="#eeeef1" /><Text style={styles.dockText}>{t('Type')}</Text></View>
        </View>
        <Text style={styles.trust}>{t('You confirm every payment.')}</Text>
      </View>
    </ScrollView>
  </View>;
}
