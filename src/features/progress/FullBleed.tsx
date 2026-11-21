import type { ReactNode } from 'react';
import { View } from 'react-native';

import { spacing } from '@/ui';

/** Lets InsightLine and EmptyState, which bring their own 16 dp side margin (they were made for a full-width screen), sit inside the padded Progress body without doubling it. */
export function FullBleed({ children }: { children: ReactNode }) {
  return <View style={{ marginHorizontal: -spacing.s4 }}>{children}</View>;
}
