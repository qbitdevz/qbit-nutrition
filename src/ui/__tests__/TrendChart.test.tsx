import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';

import { MotionProvider, ThemeProvider, TrendChart, type ChartPoint } from '..';

afterEach(async () => {
  await cleanup();
});

const points = (n: number): ChartPoint[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, date: `2026-06-${String(i + 1).padStart(2, '0')}`, value: 80 + i / 2 }));

function chart(data: ChartPoint[], onSelectPoint?: (id: string) => void, reduced = true) {
  return render(
    <ThemeProvider scheme="dark">
      <MotionProvider reduced={reduced}>
        <TrendChart
          points={data}
          scale={{ min: 80, max: 84, ticks: [80, 82, 84] }}
          formatValue={(v) => String(v)}
          formatDate={(d) => d.slice(5)}
          unit="kg"
          summary="Weight, last 30 days: a summary"
          rowLabel={(p) => `${p.date}, ${p.value} kg`}
          onSelectPoint={onSelectPoint}
          listTitle="Entries"
          showAllLabel="Show all"
          showFewerLabel="Show fewer"
        />
      </MotionProvider>
    </ThemeProvider>,
  );
}

describe('TrendChart', () => {
  it('describes the whole drawing to a screen reader as one summary and hides the drawing itself', async () => {
    await chart(points(3));
    const image = screen.getByRole('image', { name: 'Weight, last 30 days: a summary' });
    expect(image).toBeOnTheScreen();
    expect(image.props.accessible).toBe(true);
  });

  it('lists every point as text, newest first, and opens the one that is pressed', async () => {
    const onSelect = jest.fn();
    await chart(points(3), onSelect);
    const rows = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(rows).toEqual(['2026-06-03, 81 kg', '2026-06-02, 80.5 kg', '2026-06-01, 80 kg']);
    await fireEvent.press(screen.getByRole('button', { name: '2026-06-02, 80.5 kg' }));
    expect(onSelect).toHaveBeenCalledWith('p1');
  });

  it('shows five rows and reveals the rest on request', async () => {
    await chart(points(8));
    expect(screen.getAllByTestId(/^point-/)).toHaveLength(5);
    await fireEvent.press(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getAllByTestId(/^point-/)).toHaveLength(8);
    await fireEvent.press(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByTestId(/^point-/)).toHaveLength(5);
  });

  it('draws a single point as a row and a summary, with nothing to expand', async () => {
    await chart(points(1));
    expect(screen.getAllByTestId(/^point-/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeOnTheScreen();
  });

  it('renders with motion on as well (the line draws in)', async () => {
    await chart(points(4), undefined, false);
    expect(screen.getByTestId('trend-chart')).toBeOnTheScreen();
  });
});
