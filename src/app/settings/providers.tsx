import { useRouter } from 'expo-router';

import { ProvidersScreen } from '@/features/settings/ProvidersScreen';

export default function ProvidersRoute() {
  const router = useRouter();
  return (
    <ProvidersScreen
      onBack={() => router.back()}
      onAdd={() => router.push('/settings/provider-presets')}
      onOpen={(id) => router.push({ pathname: '/settings/provider', params: { id } })}
    />
  );
}
