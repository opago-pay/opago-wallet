import { validateMnemonic, wordlists } from 'bip39';

export const RECOVERY_WORD_COUNTS = [12, 15, 18, 21, 24] as const;
export type RecoveryWordCount = typeof RECOVERY_WORD_COUNTS[number];
const englishWords = new Set(wordlists.english);

export interface RecoveryInputState {
  stage: 'choose' | 'enter' | 'review';
  wordCount: RecoveryWordCount;
  words: string[];
  index: number;
  editing: boolean;
  error: string | null;
}

export function initialRecoveryInput(): RecoveryInputState {
  return { stage: 'choose', wordCount: 12, words: [], index: 0, editing: false, error: null };
}

export function normalizeRecoveryWord(value: string): string {
  return value.trim().toLowerCase();
}

export function recoveryWordError(value: string): string | null {
  const word = normalizeRecoveryWord(value);
  if (!word) return 'Enter this word from your backup.';
  if (/\s|[,;]/.test(word)) return 'Enter one word only, without spaces or commas.';
  if (!englishWords.has(word)) return 'Check the spelling. This is not a recovery word.';
  return null;
}

export function recoveryPhraseError(words: string[], count: RecoveryWordCount): string | null {
  if (words.length !== count || words.some(word => recoveryWordError(word))) {
    return 'Complete every numbered word before restoring your wallet.';
  }
  if (!validateMnemonic(words.map(normalizeRecoveryWord).join(' '))) {
    return 'These words do not form a valid recovery phrase. Check the words and their order.';
  }
  return null;
}

type RecoveryInputAction =
  | { type: 'select-count'; count: RecoveryWordCount }
  | { type: 'change'; value: string }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'edit'; index: number }
  | { type: 'reset' };

export function recoveryInputReducer(
  state: RecoveryInputState,
  action: RecoveryInputAction,
): RecoveryInputState {
  switch (action.type) {
    case 'reset': return initialRecoveryInput();
    case 'select-count':
      return {
        stage: 'enter', wordCount: action.count, words: Array(action.count).fill(''),
        index: 0, editing: false, error: null,
      };
    case 'change': {
      if (state.stage !== 'enter') return state;
      const words = [...state.words];
      words[state.index] = action.value;
      return { ...state, words, error: null };
    }
    case 'next': {
      if (state.stage !== 'enter') return state;
      const error = recoveryWordError(state.words[state.index]);
      if (error) return { ...state, error };
      const words = [...state.words];
      words[state.index] = normalizeRecoveryWord(words[state.index]);
      if (state.editing || state.index === state.wordCount - 1) {
        return { ...state, stage: 'review', words, editing: false, error: recoveryPhraseError(words, state.wordCount) };
      }
      return { ...state, words, index: state.index + 1, error: null };
    }
    case 'back':
      if (state.stage === 'review') return { ...state, stage: 'enter', index: state.wordCount - 1, error: null };
      if (state.stage !== 'enter') return state;
      if (state.editing) {
        return { ...state, stage: 'review', editing: false, error: recoveryPhraseError(state.words, state.wordCount) };
      }
      if (state.index === 0) return initialRecoveryInput();
      return { ...state, index: state.index - 1, error: null };
    case 'edit':
      if (state.stage !== 'review' || action.index < 0 || action.index >= state.wordCount) return state;
      return { ...state, stage: 'enter', index: action.index, editing: true, error: null };
  }
}
