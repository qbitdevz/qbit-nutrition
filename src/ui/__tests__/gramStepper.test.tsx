import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GramStepper, MotionProvider, ThemeProvider } from '..';

beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function Harness({ start = '100', announce }: { start?: string; announce?: (value: string) => string }) {
  const [value, setValue] = useState(start);
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider scheme="dark">
        <MotionProvider reduced>
          <GramStepper
            value={value}
            onChangeText={setValue}
            onCommit={() => undefined}
            onStep={(direction) => setValue(String(Number(value) + direction * 10))}
            inputLabel="Grams of Rice"
            decreaseLabel="Decrease Rice"
            increaseLabel="Increase Rice"
            unit="g"
            announceValue={announce}
          />
        </MotionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

describe('GramStepper announces the new value (docs/05 section 9: steppers announce "150 grams")', () => {
  it('speaks the new amount after each press of plus or minus', async () => {
    const speak = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await render(<Harness announce={(value) => `${value} grams`} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Rice' }));
    expect(speak).toHaveBeenLastCalledWith('110 grams');
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Rice' }));
    expect(speak).toHaveBeenLastCalledWith('120 grams');
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease Rice' }));
    expect(speak).toHaveBeenLastCalledWith('110 grams');
    expect(speak).toHaveBeenCalledTimes(3);
  });

  it('says nothing while the person types: the field is read by the screen reader itself', async () => {
    const speak = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await render(<Harness announce={(value) => `${value} grams`} />);
    await fireEvent.changeText(screen.getByLabelText('Grams of Rice'), '150');
    expect(speak).not.toHaveBeenCalled();
  });

  it('says nothing when the screen gives no wording', async () => {
    const speak = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await render(<Harness />);
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Rice' }));
    expect(speak).not.toHaveBeenCalled();
  });
});
