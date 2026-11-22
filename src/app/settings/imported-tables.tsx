import { useRouter } from 'expo-router';

import { ImportedTablesScreen } from '@/features/foodimport/ImportedTablesScreen';
import { useSession } from '@/features/session/AppSession';

export default function ImportedTablesRoute() {
  const router = useRouter();
  const { notifyChange } = useSession();
  return <ImportedTablesScreen onBack={() => router.back()} onAdd={() => router.push('/settings/import-table')} onChanged={notifyChange} />;
}
