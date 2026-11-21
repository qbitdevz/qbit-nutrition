import { useRouter } from 'expo-router';

import { ScanFlowScreen } from '@/features/scan/ScanFlowScreen';

export default function ScanRoute() {
  const router = useRouter();
  return (
    <ScanFlowScreen
      onClose={() => router.back()}
      // Manual entry replaces the scan, so going back from the search returns to Today, not to a camera.
      onManual={() => router.replace('/log/search')}
      // The provider settings open on top: the scan, and its photo, wait underneath.
      onProviderSettings={() => router.push('/settings/providers')}
      onReview={() => router.replace('/log/review')}
    />
  );
}
