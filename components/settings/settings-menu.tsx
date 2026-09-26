import type { ComponentProps, PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { BackupStatusNotice } from '@/components/security/backup-prompt';
import { useColorMode } from '@/hooks/useColorMode';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/lib/i18n';
import { LANGUAGE_NAMES } from '@/lib/i18n/language';
import { adaptiveStyles, themeColor } from '@/lib/theme-styles';

export type SettingsSection = 'overview' | 'security' | 'appearance' | 'language' | 'help' | 'advanced' | 'wallet';

export function getSettingsSection(value: string | string[] | undefined): SettingsSection {
  switch (value) {
    case 'security': case 'appearance': case 'language': case 'help': case 'advanced': case 'wallet':
      return value;
    default: return 'overview';
  }
}

export function settingsSectionTitle(section: SettingsSection): string {
  switch (section) {
    case 'security': return t('Security and backup');
    case 'appearance': return t('Appearance');
    case 'language': return t('Language');
    case 'help': return t('Help and legal');
    case 'advanced': return t('Advanced options');
    case 'wallet': return t('Manage this wallet');
    default: return t('Settings');
  }
}

function MenuGroup({ title, children }: PropsWithChildren<{ title: string }>) {
  return <View style={styles.group}>
    <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text>
    <View style={styles.card}>{children}</View>
  </View>;
}

function MenuRow(props: {
  title: string;
  detail: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress(): void;
  divider?: boolean;
  accent?: boolean;
  disabled?: boolean;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${props.title}. ${props.detail}`}
    accessibilityState={{ disabled: !!props.disabled }} disabled={props.disabled}
    activeOpacity={0.72} onPress={props.onPress} style={styles.row}>
    <View style={[styles.icon, props.accent && styles.accentIcon]} accessible={false}>
      <Ionicons name={props.icon} size={22} color={themeColor(props.accent ? 'accentText' : 'secondary')} />
    </View>
    <View style={styles.rowCopy}>
      <Text style={styles.rowTitle}>{props.title}</Text>
      <Text style={[styles.rowDetail, props.accent && styles.accentText]}>{props.detail}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={themeColor('muted')} accessible={false} />
    {props.divider && <View style={styles.divider} />}
  </TouchableOpacity>;
}

export function SettingsMenu(props: {
  backupChecked: boolean;
  backupLoading: boolean;
  disabled?: boolean;
  onSelect(section: SettingsSection): void;
  onLock(): void;
}) {
  const { mode } = useColorMode();
  const { language } = useLanguage();
  return <View>
    <MenuGroup title={t('Wallet')}>
      {props.backupLoading ? <View style={styles.loading}><BackupStatusNotice /></View> :
        <MenuRow title={t('Security and backup')} detail={props.backupChecked ? t('Backup checked') : t('Backup needed')}
          icon={props.backupChecked ? 'shield-checkmark-outline' : 'shield-outline'} accent={!props.backupChecked}
          disabled={props.disabled} onPress={() => props.onSelect('security')} />}
    </MenuGroup>
    <MenuGroup title={t('Preferences')}>
      <MenuRow title={t('Appearance')} detail={t(mode === 'light' ? 'Day' : 'Night')}
        icon="color-palette-outline" divider disabled={props.disabled} onPress={() => props.onSelect('appearance')} />
      <MenuRow title={t('Language')} detail={LANGUAGE_NAMES[language]}
        icon="language-outline" disabled={props.disabled} onPress={() => props.onSelect('language')} />
    </MenuGroup>
    <MenuGroup title={t('Support and information')}>
      <MenuRow title={t('Help and legal')} detail={t('Contact, privacy and terms')}
        icon="help-circle-outline" divider disabled={props.disabled} onPress={() => props.onSelect('help')} />
      <MenuRow title={t('Advanced options')} detail={t('Networks and diagnostics')}
        icon="options-outline" disabled={props.disabled} onPress={() => props.onSelect('advanced')} />
    </MenuGroup>
    <View style={[styles.card, styles.management]}>
      <MenuRow title={t('Manage this wallet')} detail={t('Local wallet data')}
        icon="wallet-outline" disabled={props.disabled} onPress={() => props.onSelect('wallet')} />
    </View>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled} onPress={props.onLock} style={styles.lock} activeOpacity={0.72}>
      <Ionicons name="lock-closed-outline" size={18} color={themeColor('secondary')} accessible={false} />
      <Text style={styles.lockText}>{t('Lock wallet now')}</Text>
    </TouchableOpacity>
  </View>;
}

const styles = adaptiveStyles(StyleSheet.create({
  group: { marginBottom: 24 },
  groupTitle: { fontSize: 13, fontWeight: '600', color: '#92929e', marginBottom: 10, marginLeft: 4 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: '#2d2d31', backgroundColor: '#151518', overflow: 'hidden' },
  row: { minHeight: 82, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#242427', alignItems: 'center', justifyContent: 'center' },
  accentIcon: { backgroundColor: '#282113' },
  rowCopy: { flex: 1 },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '600', lineHeight: 23 },
  rowDetail: { color: '#aaaab3', fontSize: 13, lineHeight: 20, marginTop: 3 },
  accentText: { color: '#ffb000' },
  divider: { position: 'absolute', bottom: 0, left: 70, right: 16, height: StyleSheet.hairlineWidth, backgroundColor: '#242427' },
  loading: { padding: 18 },
  management: { marginTop: 4 },
  lock: { minHeight: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, marginTop: 18, padding: 12 },
  lockText: { color: '#aaaab3', fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'center' },
}));
