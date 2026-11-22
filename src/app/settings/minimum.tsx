import { useRouter } from 'expo-router';

import { MinimumEnergyScreen } from '@/features/goals/MinimumEnergyScreen';

export default function MinimumRoute() {
  const router = useRouter();
  return <MinimumEnergyScreen onBack={() => router.back()} />;
}
