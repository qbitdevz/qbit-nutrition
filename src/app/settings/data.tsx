import { useRouter } from 'expo-router';

import { DataScreen } from '@/features/data/DataScreen';

export default function DataRoute() {
  const router = useRouter();
  return <DataScreen onBack={() => router.back()} onOpenProviders={() => router.push('/settings/providers')} onOpenImportedTables={() => router.push('/settings/imported-tables')} onOpenGoals={() => router.push('/settings/goal')} onOpenMeal={(id) => router.push({ pathname: '/meal/[id]', params: { id } })} />;
}
