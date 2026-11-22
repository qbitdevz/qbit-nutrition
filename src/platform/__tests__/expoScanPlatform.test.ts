/**
 * `files.keep` must finish copying before it returns the path: the meal is saved with that path right after, and
 * `File.copy()` is asynchronous in Expo SDK 58. The file system is replaced by a fake whose copy completes late.
 */
import { createExpoScanPlatform } from '../expoScanPlatform';

const mockFiles = new Map<string, string>();
const mockLog: string[] = [];

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    exists = false;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    create() {
      this.exists = true;
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    async copy(destination: { uri: string }) {
      mockLog.push('copy started');
      await new Promise((resolve) => setTimeout(resolve, 20)); // the copy takes a moment, like a real file
      mockFiles.set(destination.uri, mockFiles.get(this.uri) ?? '');
      mockLog.push('copy finished');
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///documents' }, cache: { uri: 'file:///cache' } } };
});
jest.mock('expo-camera', () => ({ Camera: {}, CameraView: () => null }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-clipboard', () => ({}));

describe('expo scan platform: keeping a photo', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockLog.length = 0;
  });

  it('returns only after the copy is finished, so the path it returns points at a complete file', async () => {
    mockFiles.set('file:///cache/capture.jpg', 'jpeg bytes');
    const path = await createExpoScanPlatform().files.keep('file:///cache/capture.jpg');
    mockLog.push('keep returned');
    expect(mockLog).toEqual(['copy started', 'copy finished', 'keep returned']);
    expect(mockFiles.get(`file:///documents/${path}`)).toBe('jpeg bytes');
  });

  it('fails when the copy fails, instead of returning a path to a file that is not there', async () => {
    // No source file: the copy rejects.
    const { File } = jest.requireMock('expo-file-system') as { File: { prototype: { copy: () => Promise<void> } } };
    jest.spyOn(File.prototype, 'copy').mockRejectedValueOnce(new Error('No space left on device.'));
    await expect(createExpoScanPlatform().files.keep('file:///cache/capture.jpg')).rejects.toThrow('No space left');
  });
});
