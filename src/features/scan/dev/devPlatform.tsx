import { Image, StyleSheet, View } from 'react-native';

import { createFakeScanPlatform } from '@/platform/fakeScanPlatform';
import type { CameraSurfaceProps, ScanPlatform } from '@/platform/scanPlatform';
import { DevBarcodeSurface } from '../../barcode/dev/DevBarcodeSurface';
import { DEV_SAMPLE_PHOTO } from './devSample';

/**
 * DEVELOPMENT ONLY (QN_DEV_ONLY_PLATFORM). The browser preview has no camera worth using, so the
 * shutter and the gallery both return a drawn sample plate. Files are in memory.
 */
export function createDevScanPlatform(): ScanPlatform {
  const platform = createFakeScanPlatform({ photoUri: DEV_SAMPLE_PHOTO });
  const FakeSurface = platform.camera.Surface;
  function DevSurface(props: CameraSurfaceProps) {
    return (
      <View style={StyleSheet.absoluteFill} testID="QN_DEV_ONLY_PLATFORM">
        <Image source={{ uri: DEV_SAMPLE_PHOTO }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <FakeSurface {...props} />
      </View>
    );
  }
  platform.camera.Surface = DevSurface;
  platform.camera.BarcodeSurface = DevBarcodeSurface;
  // Kept photos are in memory only: the meal detail shows the sample plate for them.
  platform.files.uriOf = () => DEV_SAMPLE_PHOTO;
  return platform;
}
