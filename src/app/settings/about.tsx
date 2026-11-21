import { useRouter } from 'expo-router';

import { AboutScreen } from '@/features/settings/AboutScreen';

export default function AboutRoute() {
  const router = useRouter();
  return (
    <AboutScreen
      onBack={() => router.back()}
      onOpenCalculation={() => router.push('/settings/calculation')}
      onOpenPrivacy={() => router.push('/settings/privacy')}
      onOpenLicenses={() => router.push('/settings/licenses')}
    />
  );
}
