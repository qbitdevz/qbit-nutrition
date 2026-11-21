import { useLocalSearchParams, useRouter } from 'expo-router';

import { FoodSearchScreen } from '@/features/logging/FoodSearchScreen';

export default function SearchRoute() {
  const router = useRouter();
  // Opened from the review screen ("Add another food", or a swap): going on means going back to it, not stacking another.
  const { from, swap, q, grams } = useLocalSearchParams<{ from?: string; swap?: string; q?: string; grams?: string }>();
  // Opened from a food suggestion on Today: the name and the amount come across, nothing else.
  const suggestedGrams = Number(grams);
  const prefill = !swap && q ? { query: q, grams: Number.isFinite(suggestedGrams) && suggestedGrams > 0 ? suggestedGrams : undefined } : undefined;
  const toReview = () => (from === 'review' ? router.back() : router.replace('/log/review'));
  return (
    <FoodSearchScreen
      onBack={() => router.back()}
      onAdded={toReview}
      onOpenReview={toReview}
      onCreateCustom={(name) => router.push({ pathname: '/log/custom-food', params: { name } })}
      onBarcode={() => router.push({ pathname: '/log/barcode', params: { from: from ?? '' } })}
      swap={swap ? { key: swap, query: q ?? '' } : undefined}
      prefill={prefill}
    />
  );
}
