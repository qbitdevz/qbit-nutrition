import { useLocalSearchParams, useRouter } from 'expo-router';

import { MealDetailScreen } from '@/features/meals/MealDetailScreen';

export default function MealRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MealDetailScreen mealId={id} onClose={() => router.back()} onCopied={() => router.dismissTo('/')} />;
}
