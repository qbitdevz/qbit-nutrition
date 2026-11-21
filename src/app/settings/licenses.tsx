import { useRouter } from 'expo-router';

import { LicensesScreen } from '@/features/legal/LicensesScreen';

export default function LicensesRoute() {
  const router = useRouter();
  return <LicensesScreen onBack={() => router.back()} />;
}
