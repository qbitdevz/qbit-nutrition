import { useLocalSearchParams, useRouter } from 'expo-router';

import { FoodSearchScreen } from '@/features/logging/FoodSearchScreen';

export default function SearchRoute() {
  const router = useRouter();
  // Opened from the review screen ("Add another food", or a swap): going on means going back to it, not stacking another.
  const { from, swap, q } = useLocalSearchParams<{ from?: string; swap?: string; q?: string }>();
  const toReview = () => (from === 'review' ? router.back() : router.replace('/log/review'));
  return (
    <FoodSearchScreen
      onBack={() => router.back()}
      onAdded={toReview}
      onOpenReview={toReview}
      onCreateCustom={(name) => router.push({ pathname: '/log/custom-food', params: { name } })}
      swap={swap ? { key: swap, query: q ?? '' } : undefined}
    />
  );
}
