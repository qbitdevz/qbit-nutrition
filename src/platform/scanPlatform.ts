import type { ComponentType, RefObject } from 'react';

/**
 * What the scan flow needs from the device, as plain interfaces. The app wires the Expo modules in
 * `expoScanPlatform.ts`; tests and the development preview use `fakeScanPlatform.ts`. Importing this
 * file pulls in no native module.
 */

/** A photo as the camera or the gallery returns it: a temporary file. */
export interface Photo {
  uri: string;
  width: number;
  height: number;
}

/** The photo after preprocessing: downscaled, JPEG, no metadata. */
export interface PreparedPhoto {
  uri: string;
  width: number;
  height: number;
  base64: string;
}

export type CameraPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface CameraPermission {
  status: CameraPermissionStatus;
  /** False after "don't ask again": only the system settings can turn the camera on. */
  canAskAgain: boolean;
}

export interface CameraHandle {
  capture(): Promise<Photo>;
}

export interface CameraSurfaceProps {
  flash: boolean;
  /** Set to the handle that takes the picture once the camera is ready. */
  handleRef: RefObject<CameraHandle | null>;
  onReady: () => void;
  onError: () => void;
}

export interface PhotoFiles {
  /** Deletes a temporary file. A file that is already gone is not an error. */
  discard(uri: string): Promise<void>;
  /** Copies a file into the app's private storage and returns its path relative to it (`photos/<id>.jpg`). */
  keep(uri: string): Promise<string>;
  /** Deletes a kept photo by its relative path. A missing file is not an error. */
  remove(path: string): Promise<void>;
  /** The URI to show a kept photo from. */
  uriOf(path: string): string;
}

export interface ScanPlatform {
  camera: {
    getPermission(): Promise<CameraPermission>;
    requestPermission(): Promise<CameraPermission>;
    openSettings(): Promise<void>;
    Surface: ComponentType<CameraSurfaceProps>;
  };
  picker: {
    /** Opens the gallery; null when the person closes it without choosing. */
    pick(): Promise<Photo | null>;
  };
  images: {
    /** Downscales to a long edge of at most 1,024 px and re-encodes as JPEG at about 80% (drops EXIF, including location). */
    prepare(photo: Photo): Promise<PreparedPhoto>;
  };
  files: PhotoFiles;
  clipboard: { copy(text: string): Promise<void> };
}
