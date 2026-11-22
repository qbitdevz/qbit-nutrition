import { chartGeometry } from '../chartGeometry';

const layout = { width: 340, height: 200, padding: { top: 20, right: 20, bottom: 30, left: 40 } };

describe('chartGeometry', () => {
  it('places points by date, so a gap in logging shows as a gap', () => {
    const g = chartGeometry({
      ...layout,
      points: [
        { id: 'a', date: '2026-06-01', value: 80 },
        { id: 'b', date: '2026-06-02', value: 84 },
        { id: 'c', date: '2026-06-11', value: 82 },
      ],
      scale: { min: 80, max: 84 },
    });
    // The plot is 280 wide (340 - 40 - 20) and spans ten days: the second point is a tenth of the way along.
    expect(g.points.map((p) => Math.round(p.x))).toEqual([40, 68, 320]);
    // Vertical: 150 high (200 - 20 - 30); 80 is the bottom, 84 the top.
    expect(g.points.map((p) => Math.round(p.y))).toEqual([170, 20, 95]);
  });

  it('builds the line through the points and measures it', () => {
    const g = chartGeometry({
      ...layout,
      points: [
        { id: 'a', date: '2026-06-01', value: 0 },
        { id: 'b', date: '2026-06-11', value: 0 },
      ],
      scale: { min: 0, max: 10 },
    });
    expect(g.path).toBe('M40 170L320 170');
    expect(g.length).toBeCloseTo(280, 5);
  });

  it('puts a single point in the middle and draws no line', () => {
    const g = chartGeometry({ ...layout, points: [{ id: 'a', date: '2026-06-01', value: 82 }], scale: { min: 80, max: 84 } });
    expect(g.points).toHaveLength(1);
    expect(g.points[0]!.x).toBe(180);
    expect(g.path).toBeNull();
    expect(g.length).toBe(0);
  });

  it('puts the ticks on the same vertical scale as the points', () => {
    const g = chartGeometry({ ...layout, points: [{ id: 'a', date: '2026-06-01', value: 82 }], scale: { min: 80, max: 84 } });
    expect(g.yOf(80)).toBe(170);
    expect(g.yOf(84)).toBe(20);
    expect(g.yOf(82)).toBe(95);
  });
});
