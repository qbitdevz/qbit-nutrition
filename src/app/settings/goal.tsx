import { useRouter } from 'expo-router';

import { GoalSettingsScreen } from '@/features/goals/GoalSettingsScreen';

export default function GoalSettingsRoute() {
  const router = useRouter();
  return <GoalSettingsScreen onBack={() => router.back()} onEditProfile={() => router.push('/settings/profile')} />;
}
