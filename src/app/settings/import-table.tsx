import { useRouter } from 'expo-router';

import { ImportTableScreen } from '@/features/foodimport/ImportTableScreen';
import { useSession } from '@/features/session/AppSession';

export default function ImportTableRoute() {
  const router = useRouter();
  const { notifyChange } = useSession();
  return <ImportTableScreen onClose={() => router.back()} onImported={notifyChange} />;
}
