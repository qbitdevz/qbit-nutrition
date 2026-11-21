import { useRouter } from 'expo-router';

import { PrivacyScreen } from '@/features/legal/PrivacyScreen';

export default function PrivacyRoute() {
  const router = useRouter();
  return <PrivacyScreen onBack={() => router.back()} />;
}
