import { adaptiveStyles } from '@/lib/theme-styles';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';

export function ProtectedRecoveryPhrase({ phrase }: { phrase: string }) {
  useLanguage();
  usePreventScreenCapture('opago-recovery-phrase');
  const { width, fontScale } = useWindowDimensions();
  const singleColumn = width < 350 || fontScale > 1.2;

  return (
    <View style={styles.grid}>
      {phrase.trim().split(/\s+/).map((word, index) => (
        <View
          key={index}
          style={[styles.word, singleColumn && styles.fullWidth]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={t('Word {number}, {word}', { number: index + 1, word })}
        >
          <Text style={styles.number} importantForAccessibility="no">{index + 1}</Text>
          <Text style={styles.value} importantForAccessibility="no" selectable={false}>{word}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = adaptiveStyles(StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, marginBottom: 16 },
  word: { width: '48%', flexGrow: 1, backgroundColor: '#202023', borderRadius: 12, padding: 12, minHeight: 76 },
  fullWidth: { width: '100%' },
  number: { color: '#aaaab0', fontSize: 13, marginBottom: 5 },
  value: { color: '#fff', fontSize: 20, fontWeight: '600' },
}));
