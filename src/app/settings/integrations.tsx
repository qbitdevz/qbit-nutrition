import { useRouter } from 'expo-router';

import { IntegrationsScreen } from '@/features/health/IntegrationsScreen';

export default function IntegrationsRoute() {
  const router = useRouter();
  return <IntegrationsScreen onBack={() => router.back()} onOpenPrivacy={() => router.push('/settings/privacy')} />;
}
