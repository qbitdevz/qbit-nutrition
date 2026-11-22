import { MAX_LONG_EDGE, fitLongEdge } from '../imageSize';

describe('fitLongEdge (docs/07 section 2: long edge at most 1,024 px)', () => {
  it('uses 1,024 px as the limit', () => {
    expect(MAX_LONG_EDGE).toBe(1024);
  });

  it('scales a landscape photo so its width is 1,024 and keeps the ratio', () => {
    expect(fitLongEdge(4000, 3000)).toEqual({ width: 1024, height: 768, scaled: true });
  });

  it('scales a portrait photo so its height is 1,024 and keeps the ratio', () => {
    expect(fitLongEdge(3000, 4000)).toEqual({ width: 768, height: 1024, scaled: true });
  });

  it('never enlarges an image that is already small', () => {
    expect(fitLongEdge(640, 480)).toEqual({ width: 640, height: 480, scaled: false });
    expect(fitLongEdge(1, 1)).toEqual({ width: 1, height: 1, scaled: false });
  });

  it('leaves an image exactly at the limit alone, and shrinks one pixel over it', () => {
    expect(fitLongEdge(1024, 768)).toEqual({ width: 1024, height: 768, scaled: false });
    expect(fitLongEdge(768, 1024)).toEqual({ width: 768, height: 1024, scaled: false });
    expect(fitLongEdge(1025, 1025)).toEqual({ width: 1024, height: 1024, scaled: true });
    expect(fitLongEdge(1025, 512)).toEqual({ width: 1024, height: 512, scaled: true });
  });

  it('rounds the short edge and never lets it reach zero', () => {
    expect(fitLongEdge(4032, 3024)).toEqual({ width: 1024, height: 768, scaled: true });
    expect(fitLongEdge(5000, 3333)).toEqual({ width: 1024, height: 683, scaled: true });
    expect(fitLongEdge(20000, 3)).toEqual({ width: 1024, height: 1, scaled: true });
  });

  it('takes another limit', () => {
    expect(fitLongEdge(2000, 1000, 500)).toEqual({ width: 500, height: 250, scaled: true });
  });

  it('rejects sizes that are not positive numbers', () => {
    expect(() => fitLongEdge(0, 100)).toThrow();
    expect(() => fitLongEdge(100, -1)).toThrow();
    expect(() => fitLongEdge(Number.NaN, 100)).toThrow();
    expect(() => fitLongEdge(100, Infinity)).toThrow();
  });
});
