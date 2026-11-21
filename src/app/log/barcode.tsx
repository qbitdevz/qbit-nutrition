import { useLocalSearchParams, useRouter } from 'expo-router';

import { BarcodeScreen } from '@/features/barcode/BarcodeScreen';

export default function BarcodeRoute() {
  const router = useRouter();
  // Opened from the search, which may itself have been opened from the review ("Add another food"): after an item is added,
  // go back to the review the same way the search would, without leaving the search behind in the stack.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const toReview = () => {
    if (from === 'review') router.dismiss(2);
    else {
      router.dismiss();
      router.replace('/log/review');
    }
  };
  return <BarcodeScreen onBack={() => router.back()} onAdded={toReview} onCreateCustom={() => router.push({ pathname: '/log/custom-food', params: { name: '' } })} />;
}
