import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { Button, ScreenFooter, ScreenFrame, TextField, TopBar, layout, radius, spacing, useTheme } from '@/ui';
import { MAX_HINT_CHARS } from './constants';

interface PreviewViewProps {
  photoUri: string;
  hint: string;
  onHint: (hint: string) => void;
  onRetake: () => void;
  onAnalyze: () => void;
  onClose: () => void;
  busy?: boolean;
}

/** Flow B step 2: the photo, an optional hint, "Retake" and "Analyze". */
export function PreviewView({ photoUri, hint, onHint, onRetake, onAnalyze, onClose, busy = false }: PreviewViewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <ScreenFrame
      scroll={false}
      header={<TopBar title={t('scan.preview.title')} onBack={onClose} backLabel={t('common.close')} />}
      footer={
        <ScreenFooter>
          <View style={styles.row}>
            <View style={styles.half}>
              <Button label={t('scan.preview.retake')} variant="secondary" icon="retake" onPress={onRetake} disabled={busy} />
            </View>
            <View style={styles.half}>
              <Button label={t('scan.preview.analyze')} icon="sparkle" onPress={onAnalyze} disabled={busy} />
            </View>
          </View>
        </ScreenFooter>
      }>
      <View style={styles.body}>
        <Image
          source={{ uri: photoUri }}
          style={[styles.photo, { backgroundColor: colors.surface }]}
          resizeMode="cover"
          accessibilityLabel={t('scan.photoLabel')}
          testID="scan-photo"
        />
        <TextField
          label={t('scan.preview.hintLabel')}
          value={hint}
          onChangeText={onHint}
          placeholder={t('scan.preview.hintPlaceholder')}
          hint={t('scan.preview.hintHelp')}
          maxLength={MAX_HINT_CHARS}
          returnKeyType="done"
        />
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: layout.screenMargin, paddingTop: spacing.s1, gap: spacing.s4 },
  photo: { flex: 1, minHeight: 160, borderRadius: radius.lg },
  row: { flexDirection: 'row', gap: spacing.s3 },
  half: { flex: 1 },
});
