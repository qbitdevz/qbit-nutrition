import { useRouter } from 'expo-router';

import { ReviewScreen } from '@/features/logging/ReviewScreen';

export default function ReviewRoute() {
  const router = useRouter();
  return (
    <ReviewScreen
      onAddItem={() => router.push({ pathname: '/log/search', params: { from: 'review' } })}
      onSwap={(key, name) => router.push({ pathname: '/log/search', params: { from: 'review', swap: key, q: name } })}
      onRetake={() => router.replace('/scan')}
      onSaved={() => router.dismissTo('/')}
      onClose={() => router.dismissTo('/')}
    />
  );
}
