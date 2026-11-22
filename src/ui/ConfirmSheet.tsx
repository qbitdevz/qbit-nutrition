import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { spacing } from './tokens';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  body: string;
  /** A second sentence that matters for this case ("This is the only item, so the meal is deleted too."). */
  note?: string;
  /** The destructive action ("Delete item"). */
  confirmLabel: string;
  /** The safe choice ("Keep it"): drawn as the primary button so it is the easy one to reach. */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Accessible name of the scrim ("Close"). */
  closeLabel: string;
}

/** A confirmation as a bottom card (design/system.md, "Dialog"): the safe choice is primary, the destructive one outlined. */
export function ConfirmSheet({ visible, title, body, confirmLabel, cancelLabel, onConfirm, onCancel, closeLabel, note }: ConfirmSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onCancel} title={title} closeLabel={closeLabel}>
      <AppText tone="muted">{body}</AppText>
      {note ? <AppText tone="muted">{note}</AppText> : null}
      <View style={styles.actions}>
        <Button label={cancelLabel} onPress={onCancel} />
        <Button label={confirmLabel} variant="secondary" onPress={onConfirm} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: spacing.s3 },
});
