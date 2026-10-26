import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { AppState, Image, KeyboardAvoidingView, Platform, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useOpagoAccount } from '../../hooks/useOpagoAccount';
import { Action, Card, Copy, OpagoPage, TextInput, ui } from './opago-ui';
import { IdentityIntake, emptyIdentity, validateIdentity, type IdentityPhoto } from '../../lib/opago/identity';
import type { PhotoMatchFields } from '../../lib/opago/contract-types';
import { selectIdentityPhoto, cleanupIdentityPhotos, removeIdentityPhoto } from '../../lib/opago/identity-media-native';
import { walletSession } from '../../lib/wallet-session';
import { themeColor } from '../../lib/theme-styles';
import { OpagoError } from '../../lib/opago/api';
import { t } from '../../lib/i18n';
import { Buffer } from 'buffer';

const labels: Record<keyof PhotoMatchFields,string> = { given_name: 'Given names', family_name: 'Family name', date_of_birth: 'Date of birth (YYYY-MM-DD)',
  document_number: 'Document number', document_expiry: 'Document expiry (YYYY-MM-DD)', nationality: 'Nationality (three-letter code)',
  contact_email: 'Contact email', document_type: 'Document type' };
const statuses = { draft: 'Identity details are still a draft.', submitted: 'Identity details submitted.', in_review: 'The photo and data comparison is in progress.',
  approved: 'Photo and data comparison passed. This is not a fully verified identity. UMA status: NOT_VERIFIED.',
  correction_requested: 'Please correct the requested fields in identity onboarding and submit a new revision.', rejected: 'The photo and data comparison was rejected. Contact support.' };
function errorMessage(cause: unknown) {
  const code = cause instanceof OpagoError ? cause.code : cause instanceof Error ? cause.message : '';
  const messages: Record<string,string> = {
    identity_camera_denied: 'Camera access was denied. Choose an image or enable camera access in system settings.',
    identity_image_format: 'Choose a JPEG or PNG image. Convert unsupported originals on this device first.',
    identity_image_size: 'The image must be no larger than 10 MiB.', identity_image_invalid: 'The image must be readable, at least 480 pixels on each side and within the document image limits.',
    identity_fields_invalid: 'Check the marked identity fields.', identity_photo_required: 'Add every required document side before submitting.',
    identity_photo_recovery: 'The upload result is unknown and its local image is no longer available. Check status again; do not start another submission.',
    session_expired: 'Your OPAGO session expired. Sign in or prove wallet ownership again, then recover this operation.',
    refresh_invalid: 'Your OPAGO session expired. Sign in or prove wallet ownership again, then recover this operation.',
    revision_conflict: 'The revision changed. Check status and review it again.', retry_later: 'Please wait before checking or retrying this operation.',
    identity_owner_changed: 'The account or wallet changed. Open identity onboarding again.',
  };
  return messages[code] || 'The result could not be confirmed. Check status or recover the existing operation.';
}
export default function IdentityScreen() {
  usePreventScreenCapture('opago-identity');
  const params = useLocalSearchParams<{ test?: string }>(); const testOnly = __DEV__ && params.test === '1';
  const { runtime, error: accountError } = useOpagoAccount(testOnly); const focused = useIsFocused();
  const [foreground,setForeground] = useState(AppState.currentState === 'active'); const [intake,setIntake] = useState<IdentityIntake | null>(null);
  const [fields,setFields] = useState(emptyIdentity); const [photos,setPhotos] = useState<IdentityPhoto[]>([]);
  const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [review,setReview] = useState(false);
  const [readable,setReadable] = useState(false); const [errors,setErrors] = useState<(keyof PhotoMatchFields)[]>([]); const [,redraw] = useState(0); const [reload,setReload] = useState(0);
  const subject = runtime?.account.state.credential?.subject; const walletId = runtime?.account.state.session?.wallet_id;
  const lifecycle = runtime?.account.state.syncGeneration;
  const epoch = useRef(0); const working = useRef(false); const selecting = useRef(false); const currentPhotos = useRef<IdentityPhoto[]>([]);
  currentPhotos.current = photos;
  const clearImages = () => { const old = currentPhotos.current; currentPhotos.current = []; setPhotos([]);
    for (const photo of old) void removeIdentityPhoto(photo).catch(() => {}); setReview(false); setReadable(false); };
  useEffect(() => {
    const subscription = AppState.addEventListener('change',state => {
      setForeground(state === 'active');
      if (state === 'background') { clearImages(); setFields(emptyIdentity()); if (!selecting.current) epoch.current++; }
    });
    const unsubscribe = walletSession.subscribe(() => { if (!walletSession.isUnlocked()) { epoch.current++; clearImages(); setFields(emptyIdentity()); setIntake(null); } });
    return () => { subscription.remove(); unsubscribe(); };
  }, []);
  useEffect(() => { if (!focused) { epoch.current++; clearImages(); setFields(emptyIdentity()); setIntake(null); } },[focused]);
  useEffect(() => { epoch.current++; clearImages(); setFields(emptyIdentity()); setIntake(null); },[subject,walletId,lifecycle]);
  useEffect(() => {
    if (!runtime || !focused || !foreground || !runtime.account.state.session) return;
    if (selecting.current) return;
    let alive = true; const generation = ++epoch.current; const assertWallet = walletSession.captureRuntime();
    const guard = () => { assertWallet(); if (!alive || epoch.current !== generation || !focused) throw new OpagoError('identity_owner_changed'); };
    const model = new IdentityIntake(runtime.account,guard); setIntake(null); setError('');
    void runtime.perform(async () => { await cleanupIdentityPhotos(); guard(); await model.load(); guard();
      setIntake(model); setFields({ ...model.fields }); }).catch(cause => { if (alive) { setError(errorMessage(cause)); setIntake(model); } });
    return () => { if (selecting.current) return; alive = false;
      // Mutable operation epoch deliberately invalidates every previously captured callback.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++; clearImages(); setFields(emptyIdentity()); setIntake(null); };
  }, [runtime,focused,foreground,subject,walletId,lifecycle,reload]);
  const run = async (action: () => Promise<void>) => {
    if (!runtime || !intake || working.current) return;
    working.current = true; setBusy(true); setError(''); const generation = epoch.current;
    try { await runtime.perform(action); if (epoch.current === generation) { setFields({ ...intake.fields }); redraw(v => v+1); } }
    catch (cause) { if (epoch.current === generation) setError(errorMessage(cause)); }
    finally { working.current = false; setBusy(false); }
  };
  const choose = async (source: 'camera'|'library',side: 'front'|'back') => {
    if (!intake || working.current) return;
    // A system picker may briefly background the app. This invalidates prior payment
    // authorizations and must complete in the same unlocked foreground wallet session.
    const generation = epoch.current; let selection: ReturnType<typeof walletSession.beginDeviceAuthentication>;
    try { selection = walletSession.beginDeviceAuthentication(true); } catch (cause) { setError(errorMessage(cause)); return; }
    selecting.current = true;
    await run(async () => {
      let chosen: IdentityPhoto | null = null; let retained = false;
      try {
        if (!intake.needsRecovery) await intake.edit(fields);
        chosen = await selectIdentityPhoto(source,side,() => { walletSession.captureRuntime()(); intake.guard(); });
        selection.complete(); intake.guard();
        if (chosen) { for (const old of currentPhotos.current.filter(p => p.side === side)) { await removeIdentityPhoto(old); intake.guard(); }
          setPhotos([...currentPhotos.current.filter(p => p.side !== side),chosen]); retained = true; setReadable(false); }
      } finally { selecting.current = false; selection.cancel(); if (chosen && !retained) await removeIdentityPhoto(chosen); }
    });
    if (epoch.current !== generation) setReload(v => v+1);
  };
  const change = (key: keyof PhotoMatchFields,value: string) => { setFields(f => ({ ...f, [key]: value })); setReview(false); setReadable(false); };
  const snapshot = intake?.snapshot; const editable = !!intake && !intake.needsRecovery && (!snapshot || snapshot.status === 'draft');
  const canEdit = (key: keyof PhotoMatchFields|'front'|'back') => editable && (!snapshot?.correction_fields.length || snapshot.correction_fields.includes(key));
  const sides: ('front'|'back')[] = fields.document_type === 'identity_card' ? ['front','back'] : ['front'];
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <OpagoPage title="Identity onboarding" busy={busy} error={error || accountError} testOnly={testOnly}>
      <Copy>{t('Enter the details shown on your document and add clear images of its required sides. The backend compares the photo and data. This does not verify authenticity, the document holder or full identity.')}</Copy>
      {testOnly && <Copy warning>{t('Identity test mode: use synthetic details and test images only. Status changes here are simulations.')}</Copy>}
      {!runtime?.account.state.session && <Copy>{t('Open your OPAGO account and prove wallet ownership before starting identity onboarding. Your local wallet remains usable.')}</Copy>}
      {foreground && focused && intake && <>
        {snapshot && <Card title="Identity status"><Copy>{t(statuses[snapshot.status])}</Copy>
          <Copy>{t('Revision {revision}; processing: {processing}',{ revision: snapshot.revision, processing: t('Identity processing ' + snapshot.processing_status) })}</Copy>
          {snapshot.active_approval_revision && <Copy>{t('Active photo comparison revision: {revision}. This is not full KYC.',{ revision: snapshot.active_approval_revision })}</Copy>}
          {snapshot.correction_fields.length > 0 && <Copy>{t('Requested corrections')}: {snapshot.correction_fields.map(k => t(k === 'front' ? 'Document front' : k === 'back' ? 'Document back' : labels[k])).join(', ')}</Copy>}
          <Action label="Check identity status" disabled={busy} onPress={() => void run(async () => { await intake.refresh(); })} />
          {['approved','correction_requested'].includes(snapshot.status) && <Action label="Start a new identity revision" disabled={busy || !runtime?.account.state.credential || intake.needsRecovery}
            onPress={() => void run(async () => { await intake.newRevision(); setReview(false); clearImages(); })} />}
        </Card>}
        {intake.needsRecovery && <Card title="Unconfirmed identity operation"><Copy>{t('The result is unknown. Recovery checks the existing submission before retrying the same operation. It does not create another submission.')}</Copy>
          {intake.pending?.request.path.includes('/documents?') && <>
            <Copy>{t('Select the same original image to recover an interrupted upload. A different image cannot replace the pending operation.')}</Copy>
            <Action label="Choose document image" disabled={busy} onPress={() => void choose('library',(intake.pending!.request.body as { side: 'front'|'back' }).side)} />
            {photos.map(p => <Image key={p.side} accessible accessibilityLabel={t('Document image preview')} source={{ uri: p.uri }} style={{ width: '100%',height: 240 }} resizeMode="contain" />)}
          </>}
          <Action label="Recover identity operation" disabled={busy} onPress={() => void run(async () => { await intake.recover(currentPhotos.current); })} />
        </Card>}
        {editable && !review && <Card title="Document details">
          <Action label={fields.document_type === 'passport' ? 'Passport selected — choose identity card' : 'Identity card selected — choose passport'} disabled={busy || !canEdit('document_type')}
            onPress={() => { change('document_type',fields.document_type === 'passport' ? 'identity_card' : 'passport'); clearImages(); }} />
          {(Object.keys(labels) as (keyof PhotoMatchFields)[]).filter(k => k !== 'document_type').map(key => <View key={key} style={{ gap: 6 }}>
            <Copy>{t(labels[key])}</Copy><TextInput accessibilityLabel={t(labels[key])} value={fields[key]} editable={!busy && canEdit(key)}
              onChangeText={value => change(key,key === 'nationality' ? value.toUpperCase() : value)} maxLength={key === 'nationality' ? 3 : key.includes('date') || key === 'document_expiry' ? 10 : key === 'document_number' ? 64 : key === 'contact_email' ? 254 : 100}
              autoCorrect={false} autoCapitalize={key === 'contact_email' ? 'none' : key === 'nationality' || key === 'document_number' ? 'characters' : 'words'}
              keyboardType={key === 'contact_email' ? 'email-address' : key === 'date_of_birth' || key === 'document_expiry' ? 'numbers-and-punctuation' : 'default'}
              style={[ui.input,{ color: themeColor('text'), borderColor: themeColor(errors.includes(key) ? 'errorText' : 'border') }]} />
            {errors.includes(key) && <Copy warning>{t('Check this required field.')}</Copy>}
          </View>)}
          {sides.map(side => <View key={side} style={{ gap: 8 }}><Copy>{t(side === 'front' ? 'Document front' : 'Document back')}</Copy>
            {photos.find(p => p.side === side) ? <><Image accessible accessibilityLabel={t('Document image preview')} source={{ uri: photos.find(p => p.side === side)!.uri }} style={{ width: '100%',height: 240 }} resizeMode="contain" />
              <Action label="Remove selected image" disabled={busy} onPress={() => { const p = currentPhotos.current.find(p => p.side === side)!; void removeIdentityPhoto(p).catch(() => {}); setPhotos(currentPhotos.current.filter(p => p !== p)); setReadable(false); }} /></> :
              snapshot?.documents.some(d => d.side === side) && <Copy>{t('A document image is already stored for this revision.')}</Copy>}
            <Action label="Take document photo" disabled={busy || !canEdit(side)} onPress={() => void choose('camera',side)} />
            <Action label="Choose document image" disabled={busy || !canEdit(side)} onPress={() => void choose('library',side)} />
          </View>)}
          <Action label="Review identity submission" disabled={busy} onPress={() => { const invalid = validateIdentity(fields); setErrors(invalid);
            if (invalid.length) { setError(t('Check the marked identity fields.')); return; }
            if (!sides.every(side => photos.some(p => p.side === side) || snapshot?.documents.some(d => d.side === side))) { setError(t('Add every required document side before submitting.')); return; }
            void run(async () => { await intake.edit(fields); setReview(true); }); }} />
        </Card>}
        {editable && review && <Card title="Review identity submission">
          {(Object.keys(labels) as (keyof PhotoMatchFields)[]).map(k => <Copy key={k}>{t(labels[k])}: {k === 'document_type' ? t(fields[k] === 'passport' ? 'Passport' : 'Identity card') : fields[k]}</Copy>)}
          {photos.filter(p => sides.includes(p.side)).map(p => <Image key={p.side} accessible accessibilityLabel={t(p.side === 'front' ? 'Document front' : 'Document back')} source={{ uri: p.uri }} style={{ width: '100%',height: 240 }} resizeMode="contain" />)}
          <Copy>{t('Confirm that all document details are readable, the image is correctly oriented and every required side is present. Images are sent only after your explicit confirmation.')}</Copy>
          <Action label={readable ? 'Readability confirmed — change' : 'I checked that the document is readable'} disabled={busy} onPress={() => setReadable(!readable)} />
          <Action label="Confirm and submit identity data" disabled={busy || !readable} onPress={() => void run(async () => {
            await intake.submit(currentPhotos.current.filter(p => sides.includes(p.side))); clearImages(); setReview(false);
          })} />
          <Action label="Edit identity details" disabled={busy} onPress={() => { setReview(false); setReadable(false); }} />
        </Card>}
        {editable && <Action label="Discard identity draft" destructive disabled={busy} onPress={() => void run(async () => { await intake.discard(); clearImages(); setReview(false); })} />}
        {testOnly && runtime?.setTestIdentity && <Card title="Synthetic identity controls">
          {editable && <>
            <Action label="Use synthetic identity fields" disabled={busy} onPress={() => { setFields({ given_name: 'Synthetic',family_name: 'Example',date_of_birth: '1990-01-02',
              document_number: 'TEST123',document_expiry: '2030-12-31',nationality: 'DEU',contact_email: 'synthetic@example.test',document_type: fields.document_type }); setReview(false); setReadable(false); }} />
            <Action label="Use synthetic document images" disabled={busy} onPress={() => {
              // Public, solid-colour synthetic fixture; no real document or photo library is loaded.
              const fixture = require('../../tests/fixtures/p3-photo.json') as { normalized_jpeg: string };
              clearImages(); setPhotos(sides.filter(side => canEdit(side)).map(side => ({ side,bytes: new Uint8Array(Buffer.from(fixture.normalized_jpeg,'base64')),uri:'data:image/jpeg;base64,' + fixture.normalized_jpeg })));
              setReview(false); setReadable(false);
            }} />
          </>}
          <Action label="Simulate lost identity response" disabled={busy} onPress={() => runtime?.loseTestIdentityResponse?.()} />
          {(['in_review','approved','correction_requested','rejected'] as const).map(status => <Action key={status} label={'Simulate identity ' + status} disabled={busy || !snapshot || snapshot.status === 'draft'}
            onPress={() => void run(async () => { await runtime!.setTestIdentity!(status); await intake.refresh(); })} />)}
        </Card>}
      </>}
    </OpagoPage>
  </KeyboardAvoidingView>;
}
