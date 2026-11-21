import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { CachedFile, DataPlatform, PickedFile } from './dataPlatform';

/** The device implementation of `DataPlatform`: expo-file-system, expo-sharing and expo-document-picker. */

const PHOTO_DIR = 'photos';

const photoDirectory = () => new Directory(Paths.document, PHOTO_DIR);

export function createExpoDataPlatform(): DataPlatform {
  return {
    cache: {
      async write(name, data) {
        const file = new File(Paths.cache, name);
        if (file.exists) file.delete();
        file.create();
        await file.write(data);
        return file.uri;
      },
      async remove(uri) {
        try {
          const file = new File(uri);
          if (file.exists) file.delete();
        } catch {
          // Already gone, or not ours to delete.
        }
      },
      read: (uri) => new File(uri).bytes(),
      async size(uri) {
        const file = new File(uri);
        return file.exists ? file.size : null;
      },
      async list(prefix) {
        const out: CachedFile[] = [];
        for (const entry of new Directory(Paths.cache).list()) {
          if (entry instanceof File && entry.name.startsWith(prefix)) out.push({ uri: entry.uri, modifiedAt: entry.lastModified ?? 0 });
        }
        return out;
      },
    },
    share: {
      // iOS: the share sheet's completion fires when the target is done with the file. Android: `shareAsync` resolves when the chooser
      // closes (an app was picked), while that app may still be reading the file, so the file stays until the next app start.
      completesWhenDone: Platform.OS === 'ios',
      async shareFile(uri, { mimeType, title }) {
        if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
        await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
      },
    },
    picker: {
      async clearCopies() {
        // expo-document-picker copies the chosen file into `<cache>/DocumentPicker/<id>/<name>`.
        try {
          const folder = new Directory(Paths.cache, 'DocumentPicker');
          if (!folder.exists) return 0;
          const copies = folder.list().length;
          folder.delete();
          return copies;
        } catch {
          return 0; // Not there, or not ours to delete.
        }
      },
      async pick(): Promise<PickedFile | null> {
        // Any type: exports are .json or .zip and the system picker's MIME filters for them differ by provider.
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
        const asset = result.canceled ? null : result.assets[0];
        return asset ? { uri: asset.uri, name: asset.name, size: asset.size ?? null } : null;
      },
    },
    photos: {
      async list() {
        const directory = photoDirectory();
        if (!directory.exists) return [];
        return directory.list().flatMap((entry) => (entry instanceof File ? [`${PHOTO_DIR}/${entry.name}`] : []));
      },
      async read(path) {
        const file = new File(Paths.document, path);
        return file.exists ? file.bytes() : null;
      },
      async write(bytes) {
        const directory = photoDirectory();
        directory.create({ idempotent: true, intermediates: true });
        const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.jpg`;
        const file = new File(directory, name);
        file.create();
        await file.write(bytes);
        return `${PHOTO_DIR}/${name}`;
      },
      async remove(path) {
        try {
          const file = new File(Paths.document, path);
          if (file.exists) file.delete();
        } catch {
          // Already gone.
        }
      },
    },
  };
}
