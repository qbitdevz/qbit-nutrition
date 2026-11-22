import { useRouter } from 'expo-router';

import { ReviewScreen } from '@/features/logging/ReviewScreen';

export default function ReviewRoute() {
  const router = useRouter();
  return (
    <ReviewScreen
      onAddItem={() => router.push({ pathname: '/log/search', params: { from: 'review' } })}
      onSaved={() => router.dismissTo('/')}
      onClose={() => router.dismissTo('/')}
    />
  );
}
