import { fitLongEdge } from './imageSize';
import type { PreparedPhoto } from './scanPlatform';

/** JPEG quality of the photo sent to a provider (docs/07 section 2: "about 80%"). */
export const JPEG_QUALITY = 0.8;

export interface SavedImage {
  uri: string;
  width: number;
  height: number;
  base64: string;
}

/** An image decoded by the image library. */
export interface OpenImage {
  width: number;
  height: number;
  /** A resized copy; give one side and the other follows the aspect ratio. */
  resized(size: { width?: number; height?: number }): Promise<OpenImage>;
  /** Writes a JPEG file and returns it with its base64 text. */
  saveJpeg(quality: number): Promise<SavedImage>;
}

/** The image library behind `processPhoto` (expo-image-manipulator on a device, a fake in tests). */
export interface ImageSource {
  open(uri: string): Promise<OpenImage>;
}

/**
 * Preprocessing of a photo before it leaves the phone (docs/07 section 2, step 2). The size is read
 * from the decoded image, not from what the caller reported (the camera may report it before rotation),
 * shrunk by its long edge only when it exceeds the limit, and always re-encoded: the new JPEG carries
 * no EXIF metadata, so no location leaves the device.
 */
export async function processPhoto(source: ImageSource, uri: string): Promise<PreparedPhoto> {
  const image = await source.open(uri);
  const fit = fitLongEdge(image.width, image.height);
  const ready = fit.scaled ? await image.resized(image.width >= image.height ? { width: fit.width } : { height: fit.height }) : image;
  return ready.saveJpeg(JPEG_QUALITY);
}
