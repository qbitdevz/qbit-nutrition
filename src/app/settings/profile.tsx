import { useRouter } from 'expo-router';

import { ProfileSettingsScreen } from '@/features/settings/ProfileSettingsScreen';

export default function ProfileSettingsRoute() {
  const router = useRouter();
  return <ProfileSettingsScreen onBack={() => router.back()} />;
}
