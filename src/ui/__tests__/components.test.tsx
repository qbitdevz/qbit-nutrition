import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  AppText,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  FloatingDock,
  IconButton,
  InsightLine,
  MacroCard,
  MealRow,
  MotionProvider,
  Skeleton,
  SnackbarProvider,
  ThemeProvider,
  useCountUp,
  useSnackbar,
} from '..';

afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function shell(ui: ReactElement, { reduced = true }: { reduced?: boolean } = {}) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider scheme="dark">
        <MotionProvider reduced={reduced}>{ui}</MotionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const sizeOf = (element: { props: { style?: unknown } }) => {
  const style = StyleSheet.flatten(element.props.style as never) as { width?: number; height?: number; minHeight?: number };
  return { width: style.width, height: Math.max(style.height ?? 0, style.minHeight ?? 0) };
};

describe('buttons', () => {
  it('a primary button has a role, a name, a 56 dp height, and calls onPress', async () => {
    const onPress = jest.fn();
    await render(shell(<Button label="Save meal" onPress={onPress} />));

    const button = screen.getByRole('button', { name: 'Save meal' });
    expect(sizeOf(button).height).toBeGreaterThanOrEqual(56);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a disabled button says it is disabled and ignores presses', async () => {
    const onPress = jest.fn();
    await render(shell(<Button label="Save meal" onPress={onPress} disabled />));

    const button = screen.getByRole('button', { name: 'Save meal', disabled: true });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'ghost'] as const)('the %s variant is a pill at least 48 dp high', async (variant) => {
    await render(shell(<Button label="Go" variant={variant} />));
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Go' }).props.style as never) as { borderRadius: number };
    expect(sizeOf(screen.getByRole('button', { name: 'Go' })).height).toBeGreaterThanOrEqual(48);
    expect(style.borderRadius).toBe(999);
  });

  it('an icon button needs a name and is 48 x 48', async () => {
    await render(shell(<IconButton icon="settings" label="Settings" />));
    const button = screen.getByRole('button', { name: 'Settings' });
    expect(sizeOf(button)).toEqual({ width: 48, height: 48 });
  });
});

describe('floating dock', () => {
  const tabs = (active: 'today' | 'progress') =>
    [
      { key: 'today', label: 'Today', icon: 'today', active: active === 'today', onPress: jest.fn() },
      { key: 'progress', label: 'Progress', icon: 'progress', active: active === 'progress', onPress: jest.fn() },
    ] as const;

  it('names the scan button, marks the selected tab in the accessibility tree, and navigates', async () => {
    const onScan = jest.fn();
    const items = tabs('today');
    await render(shell(<FloatingDock tabs={items} navLabel="Main navigation" scanLabel="Scan a meal" scanCaption="Scan" onScan={onScan} />));

    expect(screen.getByRole('tab', { name: 'Today', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Progress', selected: false })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Scan a meal' }));
    expect(onScan).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
    expect(items[1].onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps every dock target at least 48 dp, and the scan button the largest', async () => {
    await render(shell(<FloatingDock tabs={tabs('today')} navLabel="Main navigation" scanLabel="Scan a meal" scanCaption="Scan" onScan={jest.fn()} />));
    expect(sizeOf(screen.getByRole('tab', { name: 'Today' })).height).toBeGreaterThanOrEqual(48);
    expect(sizeOf(screen.getByRole('button', { name: 'Scan a meal' })).width).toBeGreaterThanOrEqual(76);
  });
});

describe('snackbar', () => {
  function Trigger({ onUndo }: { onUndo: () => void }) {
    const snackbar = useSnackbar();
    return <Button label="Remove" onPress={() => snackbar.show({ message: 'Removed Rice', actionLabel: 'Undo', onAction: onUndo })} />;
  }

  it('names the outcome, offers a 48 dp Undo, runs it, and goes away', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const onUndo = jest.fn();
    await render(
      shell(
        <SnackbarProvider>
          <Trigger onUndo={onUndo} />
        </SnackbarProvider>,
      ),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Removed Rice')).toBeOnTheScreen();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Removed Rice');
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(sizeOf(undo).height).toBeGreaterThanOrEqual(48);

    await fireEvent.press(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Removed Rice')).not.toBeOnTheScreen();
  });

  it('disappears by itself after a few seconds', async () => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    await render(
      shell(
        <SnackbarProvider>
          <Trigger onUndo={jest.fn()} />
        </SnackbarProvider>,
      ),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Removed Rice')).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(5100);
    });
    expect(screen.queryByText('Removed Rice')).not.toBeOnTheScreen();
  });
});

describe('bottom sheet', () => {
  it('shows its title, closes from the scrim, and renders nothing while hidden', async () => {
    const onClose = jest.fn();
    await render(
      shell(
        <BottomSheet visible onClose={onClose} title="Choose a day" closeLabel="Close">
          <Text>Past days</Text>
        </BottomSheet>,
      ),
    );
    expect(screen.getByRole('header', { name: 'Choose a day' })).toBeOnTheScreen();
    expect(screen.getByText('Past days')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is not rendered when not visible', async () => {
    await render(
      shell(
        <BottomSheet visible={false} onClose={jest.fn()} title="Choose a day" closeLabel="Close">
          <Text>Past days</Text>
        </BottomSheet>,
      ),
    );
    expect(screen.queryByText('Choose a day')).not.toBeOnTheScreen();
  });
});

describe('states', () => {
  it('empty state: headline, one sentence, and its action', async () => {
    const onPress = jest.fn();
    await render(
      shell(
        <EmptyState title="Scan your first meal" body="Tap Scan below.">
          <Button label="Add manually" variant="secondary" onPress={onPress} />
        </EmptyState>,
      ),
    );
    expect(screen.getByRole('header', { name: 'Scan your first meal' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add manually' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('error state: an alert with what happened, the detail, and recovery actions', async () => {
    await render(
      shell(
        <ErrorState title="Your day could not be loaded" message="Try again." detail="migration_failed: x">
          <Button label="Try again" />
        </ErrorState>,
      ),
    );
    expect(screen.getByTestId('error-state').props.accessibilityRole).toBe('alert');
    expect(screen.getByText('migration_failed: x')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('skeleton blocks are hidden from screen readers (the screen announces loading)', async () => {
    await render(shell(<Skeleton height={20} />));
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
    expect(screen.queryByRole('text')).not.toBeOnTheScreen();
  });
});

describe('content components', () => {
  it('macro card: name, grams, target, and a spoken summary; the colour is only decoration', async () => {
    await render(
      shell(
        <MacroCard kind="protein" name="Protein" grams={78} targetGrams={150} unit="g" summary="Protein, 78 of 150 grams" formatNumber={(n) => String(n)} />,
      ),
    );
    const card = screen.getByRole('progressbar', { name: 'Protein, 78 of 150 grams' });
    expect(card.props.accessibilityValue).toEqual({ min: 0, max: 150, now: 78 });
    expect(screen.getByText('Protein')).toBeOnTheScreen();
  });

  it('meal row is a button only when it has an action', async () => {
    const { rerender } = await render(shell(<MealRow name="Rice" meta="Lunch · 12:00" kcal="260" kcalUnit="kcal" summary="Rice, Lunch at 12:00, 260 kilocalories" />));
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    await rerender(shell(<MealRow name="Rice" meta="Lunch · 12:00" kcal="260" kcalUnit="kcal" summary="Rice, Lunch at 12:00, 260 kilocalories" onPress={jest.fn()} />));
    expect(sizeOf(screen.getByRole('button', { name: 'Rice, Lunch at 12:00, 260 kilocalories' })).height).toBeGreaterThanOrEqual(72);
  });

  it('insight line carries its text as its accessible name', async () => {
    await render(shell(<InsightLine text="72 g of protein left to reach your target." />));
    expect(screen.getByTestId('insight')).toHaveAccessibleName('72 g of protein left to reach your target.');
  });

  it('text follows the system font scale (no fixed scaling off)', async () => {
    await render(shell(<AppText testID="t">Hello</AppText>));
    expect(screen.getByTestId('t').props.allowFontScaling).not.toBe(false);
  });
});

describe('motion', () => {
  function Counter({ to, from }: { to: number; from: number }) {
    const shown = useCountUp(to, from);
    return <Text testID="count">{shown}</Text>;
  }

  it('reduced motion: a number is its final value on the very first render', async () => {
    await render(shell(<Counter to={864} from={2100} />, { reduced: true }));
    expect(screen.getByTestId('count')).toHaveTextContent('864');
  });

  it('motion on: a number starts from its start value and arrives at the final one', async () => {
    await render(shell(<Counter to={864} from={2100} />, { reduced: false }));
    expect(screen.getByTestId('count')).toHaveTextContent('2100');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1400));
    });
    expect(screen.getByTestId('count')).toHaveTextContent('864');
  });

  it('follows the system reduce-motion setting, and renders only once it is known', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    await render(
      <MotionProvider>
        <Counter to={5} from={100} />
      </MotionProvider>,
    );
    expect(await screen.findByTestId('count')).toHaveTextContent('5');
  });

  it('with the setting off, the same provider animates', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    await render(
      <MotionProvider>
        <Counter to={5} from={100} />
      </MotionProvider>,
    );
    expect(await screen.findByTestId('count')).toHaveTextContent('100');
  });
});
