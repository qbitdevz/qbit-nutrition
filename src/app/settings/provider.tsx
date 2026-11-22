import { useLocalSearchParams, useRouter } from 'expo-router';

import { ProviderFormScreen } from '@/features/settings/ProviderFormScreen';

export default function ProviderRoute() {
  const router = useRouter();
  const { id, preset } = useLocalSearchParams<{ id?: string; preset?: string }>();
  return (
    <ProviderFormScreen
      providerId={id}
      presetId={preset}
      onBack={() => router.back()}
      // Back to the list of providers, whether the form was opened from it or from the preset picker.
      onDone={() => router.dismissTo('/settings/providers')}
    />
  );
}
