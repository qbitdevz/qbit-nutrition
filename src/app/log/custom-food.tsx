import { useLocalSearchParams, useRouter } from 'expo-router';

import { CustomFoodScreen } from '@/features/logging/CustomFoodScreen';

export default function CustomFoodRoute() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name?: string }>();
  return <CustomFoodScreen initialName={name ?? ''} onBack={() => router.back()} onCreated={() => router.back()} />;
}
