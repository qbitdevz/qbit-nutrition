import { useEffect } from 'react';
import { View } from 'react-native';

import type { BarcodeScan, BarcodeSurfaceProps, CameraPermissionStatus, CameraSurfaceProps, Photo, PreparedPhoto, ScanPlatform } from './scanPlatform';

/** A string that stands for JPEG data in tests; adapters never decode it. */
export const FAKE_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQ';

export interface FakeScanState {
  permission: CameraPermissionStatus;
  /** What the permission becomes when the person agrees to the system prompt. */
  onRequest: CameraPermissionStatus;
  canAskAgain: boolean;
  /** Temporary files that exist right now (captures, gallery copies, preprocessed JPEGs). */
  temp: Set<string>;
  /** Kept photos by relative path. */
  kept: Map<string, string>;
  /** What the next gallery pick returns; null: the person closed the gallery. */
  nextPick: 'photo' | null;
  shots: number;
  prepareCalls: number;
  lastPrepared: PreparedPhoto | null;
  failPrepare: boolean;
  failKeep: boolean;
  lastFlash: boolean;
  copied: string[];
  settingsOpened: number;
  /** Override of what the capture returns (the development preview shows a sample picture). */
  photoUri: string | null;
  /** The barcode viewfinder fails to start (the camera is busy or broken). */
  failBarcodeCamera: boolean;
  /** Whether a barcode viewfinder is on screen right now, and its torch. */
  barcodeCameraOn: boolean;
  barcodeTorch: boolean;
}

export interface FakeScanPlatform extends ScanPlatform {
  state: FakeScanState;
  /** What the barcode camera "reads": delivers the scan to the viewfinder on screen (nothing happens when none is). */
  emitBarcode(code: string, format?: string): void;
}

/**
 * Test and development stand-in for the device: an in-memory camera, gallery, image processor and file
 * store, with every temporary and kept file visible in `state` so tests can check what is left behind.
 * No native module is touched.
 */
export function createFakeScanPlatform(initial: Partial<FakeScanState> = {}): FakeScanPlatform {
  const state: FakeScanState = {
    permission: 'granted',
    onRequest: 'granted',
    canAskAgain: true,
    temp: new Set(),
    kept: new Map(),
    nextPick: 'photo',
    shots: 0,
    prepareCalls: 0,
    lastPrepared: null,
    failPrepare: false,
    failKeep: false,
    lastFlash: false,
    copied: [],
    settingsOpened: 0,
    photoUri: null,
    failBarcodeCamera: false,
    barcodeCameraOn: false,
    barcodeTorch: false,
    ...initial,
  };
  let counter = 0;
  let barcodeListener: ((scan: BarcodeScan) => void) | null = null;

  const newPhoto = (): Photo => {
    counter += 1;
    const uri = state.photoUri ?? `file:///cache/capture-${counter}.jpg`;
    state.temp.add(uri);
    return { uri, width: 4000, height: 3000 };
  };

  function Surface({ flash, handleRef, onReady }: CameraSurfaceProps) {
    useEffect(() => {
      handleRef.current = {
        async capture() {
          state.shots += 1;
          state.lastFlash = flash;
          return newPhoto();
        },
      };
      onReady();
      return () => {
        handleRef.current = null;
      };
    }, [flash, handleRef, onReady]);
    return <View testID="fake-camera" accessibilityLabel="Camera preview" style={{ flex: 1, backgroundColor: '#222' }} />;
  }

  function BarcodeSurface({ torch, onScanned, onReady, onError }: BarcodeSurfaceProps) {
    useEffect(() => {
      barcodeListener = onScanned;
      state.barcodeCameraOn = true;
      if (state.failBarcodeCamera) onError();
      else onReady();
      return () => {
        barcodeListener = null;
        state.barcodeCameraOn = false;
      };
    }, [onScanned, onReady, onError]);
    useEffect(() => {
      state.barcodeTorch = torch;
    }, [torch]);
    return <View testID="fake-barcode-camera" accessibilityLabel="Camera preview" style={{ flex: 1, backgroundColor: '#222' }} />;
  }

  return {
    state,
    emitBarcode: (code, format = 'ean13') => barcodeListener?.({ code, format }),
    camera: {
      getPermission: async () => ({ status: state.permission, canAskAgain: state.canAskAgain }),
      requestPermission: async () => {
        state.permission = state.onRequest;
        if (state.permission === 'denied') state.canAskAgain = false;
        return { status: state.permission, canAskAgain: state.canAskAgain };
      },
      openSettings: async () => {
        state.settingsOpened += 1;
      },
      Surface,
      BarcodeSurface,
    },
    picker: { pick: async () => (state.nextPick === 'photo' ? newPhoto() : null) },
    images: {
      async prepare(photo) {
        state.prepareCalls += 1;
        if (state.failPrepare) throw new Error('The image library could not read this file.');
        counter += 1;
        const prepared: PreparedPhoto = { uri: `file:///cache/prepared-${counter}.jpg`, width: 1024, height: 768, base64: `${FAKE_JPEG_BASE64}${counter}` };
        state.temp.add(prepared.uri);
        state.lastPrepared = prepared;
        void photo;
        return prepared;
      },
    },
    files: {
      async discard(uri) {
        state.temp.delete(uri);
      },
      async keep(uri) {
        if (state.failKeep) throw new Error('No space left on device.');
        if (!state.temp.has(uri)) throw new Error(`Nothing to keep at ${uri}`);
        counter += 1;
        const path = `photos/${counter}.jpg`;
        state.kept.set(path, uri);
        return path;
      },
      async remove(path) {
        state.kept.delete(path);
      },
      uriOf: (path) => `file:///files/${path}`,
    },
    clipboard: {
      async copy(text) {
        state.copied.push(text);
      },
    },
  };
}
