import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Outfit_500Medium } from '@expo-google-fonts/outfit/500Medium';
import { Outfit_600SemiBold } from '@expo-google-fonts/outfit/600SemiBold';
import { Outfit_700Bold } from '@expo-google-fonts/outfit/700Bold';
import { useFonts } from 'expo-font';

import { fontFamily } from './tokens';

/**
 * Outfit (display) and Figtree (body), both under the SIL Open Font License 1.1, bundled as files
 * inside the app by Metro: nothing is fetched at run time. Only the weights the type scale uses
 * are imported, so unused weights do not ship.
 */
export const appFonts = {
  [fontFamily.display500]: Outfit_500Medium,
  [fontFamily.display600]: Outfit_600SemiBold,
  [fontFamily.display700]: Outfit_700Bold,
  [fontFamily.body400]: Figtree_400Regular,
  [fontFamily.body500]: Figtree_500Medium,
  [fontFamily.body600]: Figtree_600SemiBold,
  [fontFamily.body700]: Figtree_700Bold,
};

/** `[loaded, error]`. A font failure must not block the app: text falls back to the system font. */
export function useAppFonts(): readonly [boolean, Error | null] {
  return useFonts(appFonts);
}
