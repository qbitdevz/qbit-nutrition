import { processPhoto, type OpenImage, type ImageSource } from '../imageProcessor';

function fakeSource(width: number, height: number) {
  const calls: { resize?: { width?: number; height?: number }; quality?: number; opened?: string }[] = [];
  const open = (uri: string, size: { width: number; height: number }, log: (typeof calls)[number]): OpenImage => ({
    width: size.width,
    height: size.height,
    async resized(next) {
      log.resize = next;
      const w = next.width ?? Math.round((size.width * (next.height as number)) / size.height);
      const h = next.height ?? Math.round((size.height * (next.width as number)) / size.width);
      return open(uri, { width: w, height: h }, log);
    },
    async saveJpeg(quality) {
      log.quality = quality;
      return { uri: `file:///cache/out-${size.width}x${size.height}.jpg`, width: size.width, height: size.height, base64: 'QUJD' };
    },
  });
  const source: ImageSource = {
    async open(uri) {
      const log: (typeof calls)[number] = { opened: uri };
      calls.push(log);
      return open(uri, { width, height }, log);
    },
  };
  return { source, calls };
}

describe('processPhoto', () => {
  it('shrinks a landscape photo by its width and re-encodes it as JPEG at 80%', async () => {
    const { source, calls } = fakeSource(4000, 3000);
    const prepared = await processPhoto(source, 'file:///cache/shot.jpg');
    expect(calls[0]!.resize).toEqual({ width: 1024 });
    expect(calls[0]!.quality).toBe(0.8);
    expect(prepared).toEqual({ uri: 'file:///cache/out-1024x768.jpg', width: 1024, height: 768, base64: 'QUJD' });
  });

  it('shrinks a portrait photo by its height', async () => {
    const { source, calls } = fakeSource(3000, 4000);
    await processPhoto(source, 'file:///cache/shot.jpg');
    expect(calls[0]!.resize).toEqual({ height: 1024 });
  });

  it('measures the photo as it is decoded, not as the caller reported it', async () => {
    const { source } = fakeSource(768, 1024);
    const prepared = await processPhoto(source, 'file:///cache/shot.jpg');
    expect(prepared.height).toBe(1024);
  });

  it('still re-encodes a small photo (that is what drops its EXIF data) without resizing it', async () => {
    const { source, calls } = fakeSource(800, 600);
    const prepared = await processPhoto(source, 'file:///cache/shot.jpg');
    expect(calls[0]!.resize).toBeUndefined();
    expect(calls[0]!.quality).toBe(0.8);
    expect(prepared.width).toBe(800);
  });

  it('leaves a photo exactly 1,024 px wide as it is', async () => {
    const { source, calls } = fakeSource(1024, 768);
    await processPhoto(source, 'file:///cache/shot.jpg');
    expect(calls[0]!.resize).toBeUndefined();
  });
});
