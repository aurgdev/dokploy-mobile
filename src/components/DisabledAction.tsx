import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

interface DisabledActionProps {
  message: string;
}

export const DisabledActionExplanation: React.FC<DisabledActionProps> = ({ message }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.statsBg, borderColor: colors.border }]}>
      <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
  }
});

export default DisabledActionExplanation;
