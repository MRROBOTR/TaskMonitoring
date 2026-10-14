import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Button, H2, Input } from '@/components/ui';
import { sanitizeTitle } from '@/domain/services/documentValidation';
import { colors } from '@/theme';

export function RenameDialog({ initial, onSave, onCancel }: { initial: string; onSave: (t: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const clean = sanitizeTitle(value);
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <H2>Yeniden adlandır</H2>
          <Input value={value} onChangeText={setValue} autoFocus maxLength={200} />
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <Button title="Vazgeç" kind="secondary" onPress={onCancel} />
            <Button title="Kaydet" disabled={!clean} onPress={() => onSave(clean)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  box: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
});
