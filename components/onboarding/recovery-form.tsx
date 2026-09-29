import { adaptColor, adaptiveStyles, themeColor } from '@/lib/theme-styles';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, Platform, StyleSheet, Text, View,
} from 'react-native';
import { TextInput, TouchableOpacity } from '@/components/ui/wallet-interaction';
import { Ionicons } from '@expo/vector-icons';
import {
  initialRecoveryInput, normalizeRecoveryWord, recoveryInputReducer, recoveryPhraseError,
  type RecoveryWordCount,
} from '@/lib/recovery-input';

export function RecoveryForm({ loading, onBack, onRestore }: {
  loading: boolean;
  onBack(): void;
  onRestore(phrase: string): Promise<boolean>;
}) {
  useLanguage();
  const [state, dispatch] = useReducer(recoveryInputReducer, undefined, initialRecoveryInput);
  const [otherLengths, setOtherLengths] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (state.stage === 'enter') inputRef.current?.focus();
    else Keyboard.dismiss();
  }, [state.stage]);

  function back() {
    if (loading) return;
    if (state.stage === 'choose') onBack();
    else dispatch({ type: 'back' });
  }

  async function restore() {
    if (loading || submittingRef.current || recoveryPhraseError(state.words, state.wordCount)) return;
    submittingRef.current = true;
    try {
      const success = await onRestore(state.words.map(normalizeRecoveryWord).join(' '));
      if (success) dispatch({ type: 'reset' });
    } finally {
      submittingRef.current = false;
    }
  }

  function lengthButton(count: RecoveryWordCount, compact = false) {
    return (
      <TouchableOpacity
        key={count}
        style={[styles.lengthButton, compact && styles.lengthButtonCompact]}
        onPress={() => dispatch({ type: 'select-count', count })}
        accessibilityRole="button"
        accessibilityLabel={t('{count} recovery words', { count })}
      >
        <Text style={[styles.lengthNumber, compact && styles.lengthNumberCompact]}>{count}</Text>
        <Text style={styles.lengthLabel}>{t("words")}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton} onPress={back} disabled={loading}
          accessibilityRole="button" accessibilityLabel={state.stage === 'choose' ? t('Back to welcome') : t('Previous step')}
        >
          <Ionicons name="arrow-back" size={22} color={adaptColor('#f6f3e9', 'color')} />
        </TouchableOpacity>
        <Text style={styles.eyebrow}>{t("RESTORE YOUR WALLET")}</Text>
      </View>

      {state.stage === 'choose' ? (
        <View style={styles.choose}>
          <Text style={styles.title}>{t('Welcome back.')}</Text>
          <Text style={styles.description}>{t("How many words are on your recovery backup?")}</Text>
          <View style={styles.lengthOptions}>{lengthButton(12)}{lengthButton(24)}</View>
          <TouchableOpacity
            style={styles.otherLengths} onPress={() => setOtherLengths(value => !value)}
            accessibilityRole="button" accessibilityState={{ expanded: otherLengths }}
          >
            <Text style={styles.otherLengthsText}>{t("My backup has 15, 18 or 21 words")}</Text>
            <Ionicons name={otherLengths ? 'chevron-up' : 'chevron-down'} size={16} color={adaptColor('#a1a296', 'color')} />
          </TouchableOpacity>
          {otherLengths && (
            <View style={styles.lengthOptions}>{([15, 18, 21] as const).map(count => lengthButton(count, true))}</View>
          )}
          <View style={styles.note}>
            <Ionicons name="list-outline" size={20} color={adaptColor('#ffb000', 'color')} />
            <Text style={styles.noteText}>{t("We’ll ask for one word at a time, in the order on your backup.")}</Text>
          </View>
        </View>
      ) : state.stage === 'enter' ? (
        <View style={styles.entry}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>{state.editing ? t('EDIT WORD') : t('YOUR RECOVERY WORDS')}</Text>
            <Text style={styles.progressCount}>{state.index + 1} / {state.wordCount}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((state.index + 1) / state.wordCount) * 100}%` }]} />
          </View>
          <Text style={styles.wordTitle}>{t('Word {number}', { number: state.index + 1 })}</Text>
          <Text style={styles.wordInstruction}>{t("Enter only this word from your backup.")}{ '\n' }{t("No spaces or commas needed.")}</Text>
          <TextInput
            ref={inputRef}
            style={[styles.input, !!state.error && styles.inputError]}
            value={state.words[state.index]}
            onChangeText={value => dispatch({ type: 'change', value })}
            placeholder={t('Enter word {number}', { number: state.index + 1 })}
            placeholderTextColor={adaptColor('#696d60', 'color')}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            keyboardType={Platform.OS === 'android' ? 'visible-password' : 'ascii-capable'}
            submitBehavior="submit"
            blurOnSubmit={false}
            returnKeyType="next"
              selectionColor={themeColor('accentText')}
            editable={!loading}
            onSubmitEditing={() => dispatch({ type: 'next' })}
            accessibilityLabel={t('Recovery word {number} of {count}', { number: state.index + 1, count: state.wordCount })}
            accessibilityHint={t("Enter one word without separators")}
          />
          <Text style={styles.error} accessibilityLiveRegion="polite">{t(state.error || ' ')}</Text>
          <TouchableOpacity
            style={[styles.primaryButton, !state.words[state.index].trim() && styles.disabled]}
            disabled={!state.words[state.index].trim() || loading}
            onPress={() => dispatch({ type: 'next' })}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {state.editing ? t('Save word') : state.index === state.wordCount - 1 ? t('Review my words') : t('Next word')}
            </Text>
            <Ionicons name="arrow-forward" size={21} color={adaptColor('#15150e', 'color')} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.review}>
          <Text style={styles.reviewTitle}>{t("Check your words.")}</Text>
          <Text style={styles.description}>{t("Follow the order on your backup. Tap a word to change it.")}</Text>
          <View style={styles.wordsGrid}>
            {state.words.map((word, index) => (
              <TouchableOpacity
                key={index} style={styles.wordChip} disabled={loading}
                onPress={() => dispatch({ type: 'edit', index })}
                accessibilityRole="button" accessibilityLabel={t('Edit word {number}: {word}', { number: index + 1, word })}
              >
                <Text style={styles.wordNumber}>{index + 1}</Text>
                <Text style={styles.reviewWord}>{word}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!!state.error && <Text style={styles.reviewError} accessibilityRole="alert">{t(state.error || '')}</Text>}
          <TouchableOpacity
            style={[styles.primaryButton, (loading || !!recoveryPhraseError(state.words, state.wordCount)) && styles.disabled]}
            disabled={loading || !!recoveryPhraseError(state.words, state.wordCount)}
            onPress={() => void restore()}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>{t("Restore my wallet")}</Text>
            {loading ? <ActivityIndicator color={adaptColor('#15150e', 'color')} /> : <Ionicons name="arrow-forward" size={21} color={adaptColor('#15150e', 'color')} />}
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.privacy}>
        <Ionicons name="lock-closed-outline" size={13} color={adaptColor('#929788', 'color')} />
        <Text style={styles.privacyText}>{t("Your words stay on this device.")}</Text>
      </View>
    </View>
  );
}

const styles = adaptiveStyles(StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#30342b', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#9ca18f', fontSize: 10, fontWeight: '600', letterSpacing: 1.5 },
  choose: { paddingTop: 38 },
  title: { color: '#f6f3e9', fontSize: 48, lineHeight: 51, letterSpacing: -2, fontWeight: '600' },
  description: { color: '#a3a99a', fontSize: 15, lineHeight: 23, marginTop: 18, marginBottom: 26 },
  lengthOptions: { flexDirection: 'row', gap: 12 },
  lengthButton: { flex: 1, minHeight: 132, backgroundColor: '#1b2017', borderWidth: 1, borderColor: '#3b4331', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  lengthNumber: { color: '#ffb000', fontSize: 44, fontWeight: '500', letterSpacing: -1.5 },
  lengthLabel: { color: '#c1c6b7', fontSize: 14, marginTop: 4 },
  lengthButtonCompact: { minHeight: 88 },
  lengthNumberCompact: { fontSize: 28 },
  otherLengths: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 54 },
  otherLengthsText: { color: '#a1a296', fontSize: 12, flexShrink: 1 },
  note: { flexDirection: 'row', gap: 12, paddingTop: 24, marginTop: 14, borderTopWidth: 1, borderTopColor: '#2b3025' },
  noteText: { color: '#a3a99a', flex: 1, fontSize: 14, lineHeight: 22 },
  entry: { paddingTop: 28 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { color: '#919987', fontSize: 10, fontWeight: '600', letterSpacing: 1.2 },
  progressCount: { color: '#e0e3d8', fontSize: 13, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 3, backgroundColor: '#2d3326', borderRadius: 2, marginTop: 12, marginBottom: 26 },
  progressFill: { height: 3, backgroundColor: '#ffb000', borderRadius: 2 },
  wordTitle: { color: '#f6f3e9', fontSize: 36, lineHeight: 42, fontWeight: '600', letterSpacing: -1.3 },
  wordInstruction: { color: '#a3a99a', fontSize: 14, lineHeight: 22, marginTop: 10, marginBottom: 22 },
  input: { minHeight: 64, backgroundColor: '#1b2017', borderWidth: 1, borderColor: '#a88837', borderRadius: 16, paddingHorizontal: 18, color: '#f6f3e9', fontSize: 23 },
  inputError: { borderColor: '#ea9681' },
  error: { color: '#ffab97', fontSize: 12, lineHeight: 18, minHeight: 46, paddingTop: 8 },
  primaryButton: { minHeight: 58, borderRadius: 16, paddingHorizontal: 20, backgroundColor: '#ffb000', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  primaryButtonText: { color: '#15150e', fontSize: 16, fontWeight: '700', flexShrink: 1 },
  disabled: { opacity: 0.45 },
  review: { paddingTop: 30 },
  reviewTitle: { color: '#f6f3e9', fontSize: 32, fontWeight: '600', letterSpacing: -1 },
  wordsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginBottom: 24 },
  wordChip: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 46, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#1b2017', borderWidth: 1, borderColor: '#30382a' },
  wordNumber: { color: '#888f7f', fontSize: 11, minWidth: 16, fontVariant: ['tabular-nums'] },
  reviewWord: { color: '#e6e8de', fontSize: 14, flexShrink: 1, paddingVertical: 10 },
  reviewError: { color: '#ffab97', fontSize: 13, lineHeight: 20, marginBottom: 20 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 24 },
  privacyText: { color: '#929788', fontSize: 11 },
}));
