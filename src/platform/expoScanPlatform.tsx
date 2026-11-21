import * as Clipboard from 'expo-clipboard';
import { Camera, CameraView } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { processPhoto, type ImageSource, type OpenImage } from './imageProcessor';
import type { CameraPermission, CameraSurfaceProps, Photo, PhotoFiles, ScanPlatform } from './scanPlatform';

/** The device implementation of `ScanPlatform`: expo-camera, expo-image-picker, expo-image-manipulator, expo-file-system, expo-clipboard. */

const PHOTO_DIR = 'photos';

const toPermission = (response: { status: string; canAskAgain: boolean }): CameraPermission => ({
  status: response.status === 'granted' ? 'granted' : response.status === 'denied' ? 'denied' : 'undetermined',
  canAskAgain: response.canAskAgain,
});

function CameraSurface({ flash, handleRef, onReady, onError }: CameraSurfaceProps) {
  const camera = useRef<CameraView>(null);
  useEffect(() => {
    handleRef.current = {
      async capture() {
        const picture = await camera.current!.takePictureAsync({ quality: 0.9, exif: false, base64: false });
        return { uri: picture.uri, width: picture.width, height: picture.height };
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);
  return (
    <CameraView
      ref={camera}
      style={StyleSheet.absoluteFill}
      facing="back"
      mode="picture"
      flash={flash ? 'on' : 'off'}
      onCameraReady={onReady}
      onMountError={onError}
    />
  );
}

function wrap(ref: ImageRef): OpenImage {
  return {
    width: ref.width,
    height: ref.height,
    resized: async (size) => wrap(await ImageManipulator.manipulate(ref).resize(size).renderAsync()),
    async saveJpeg(quality) {
      const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
      return { uri: saved.uri, width: saved.width, height: saved.height, base64: saved.base64 ?? '' };
    },
  };
}

const imageSource: ImageSource = {
  open: async (uri) => wrap(await ImageManipulator.manipulate(uri).renderAsync()),
};

const files: PhotoFiles = {
  async discard(uri) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Already gone, or not ours to delete: nothing to do.
    }
  },
  async keep(uri) {
    const directory = new Directory(Paths.document, PHOTO_DIR);
    directory.create({ idempotent: true, intermediates: true });
    const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.jpg`;
    // `copy` is asynchronous: the path is returned (and a meal saved with it) only once the file is complete.
    await new File(uri).copy(new File(directory, name));
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
  uriOf: (path) => new File(Paths.document, path).uri,
};

export function createExpoScanPlatform(): ScanPlatform {
  return {
    camera: {
      getPermission: async () => toPermission(await Camera.getCameraPermissionsAsync()),
      requestPermission: async () => toPermission(await Camera.requestCameraPermissionsAsync()),
      openSettings: () => Linking.openSettings(),
      Surface: CameraSurface,
    },
    picker: {
      async pick(): Promise<Photo | null> {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false, base64: false });
        const asset = result.canceled ? null : result.assets[0];
        return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
      },
    },
    images: { prepare: (photo) => processPhoto(imageSource, photo.uri) },
    files,
    clipboard: { copy: (text) => Clipboard.setStringAsync(text).then(() => undefined) },
  };
}
