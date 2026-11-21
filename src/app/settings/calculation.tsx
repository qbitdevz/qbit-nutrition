import { useRouter } from 'expo-router';

import { CalculationScreen } from '@/features/goals/CalculationScreen';

export default function CalculationRoute() {
  const router = useRouter();
  return <CalculationScreen onBack={() => router.back()} />;
}
