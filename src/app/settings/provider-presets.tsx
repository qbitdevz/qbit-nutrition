import { useRouter } from 'expo-router';

import { ProviderPresetsScreen } from '@/features/settings/ProviderPresetsScreen';

export default function ProviderPresetsRoute() {
  const router = useRouter();
  return (
    <ProviderPresetsScreen
      onBack={() => router.back()}
      onChoose={(preset) => router.push({ pathname: '/settings/provider', params: { preset } })}
    />
  );
}
