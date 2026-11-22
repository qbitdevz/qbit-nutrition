/**
 * Test-only: walks a rendered tree and lists what breaks the accessibility rules of docs/05 section 9 that a test can pin:
 * every control has a role and an accessible name, every touch target is declared at least 48 dp tall (and 48 dp wide when it
 * declares a width), and every text input has a label. What it cannot see (contrast, focus order on a device, 200% text) is
 * checked by hand and reported in the task evidence. Never import this from app code.
 */
import { StyleSheet } from 'react-native';

export const MIN_TARGET = 48;

interface HostNode {
  type: unknown;
  props?: Record<string, unknown>;
  children?: (HostNode | string)[];
}

const nameOf = (type: unknown): string => (typeof type === 'string' ? type : ((type as { name?: string })?.name ?? ''));

/** True when a screen reader skips this node and everything under it. */
function hidden(props: Record<string, unknown>): boolean {
  return props['aria-hidden'] === true || props.importantForAccessibility === 'no-hide-descendants' || props.accessibilityElementsHidden === true;
}

/** The text a screen reader would speak for a control that has no label of its own: the text of what is inside it. */
function textOf(node: HostNode | string): string {
  if (typeof node === 'string') return node;
  if (hidden(node.props ?? {})) return '';
  return (node.children ?? []).map(textOf).join('');
}

type Box = { height?: number; minHeight?: number; width?: number; minWidth?: number; position?: string; top?: number; bottom?: number; left?: number; right?: number };
const flat = (style: unknown): Box => (StyleSheet.flatten(style as never) ?? {}) as never;

export interface A11yOptions {
  /** Roles whose size is the text line itself, which WCAG 2.5.8 exempts (inline links). */
  exemptRoles?: string[];
  /** Controls to leave out by accessible name, with the reason written next to the test that passes it. */
  ignoreNames?: (string | RegExp)[];
}

export function accessibilityFindings(root: HostNode, options: A11yOptions = {}): string[] {
  const out: string[] = [];
  const exempt = new Set(options.exemptRoles ?? ['link']);

  const visit = (node: HostNode | string, trail: string) => {
    if (typeof node === 'string') return;
    const props = node.props ?? {};
    if (hidden(props)) return;
    const type = nameOf(node.type);
    const label = String(props.accessibilityLabel ?? props['aria-label'] ?? '').trim();
    const name = label || textOf(node).trim();
    const where = `${trail}${type}${name ? ` "${name.slice(0, 40)}"` : ''}`;
    const role = String(props.accessibilityRole ?? props.role ?? '');
    const pressable = typeof props.onClick === 'function' || typeof props.onResponderRelease === 'function';

    if (pressable) {
      const ignored = (options.ignoreNames ?? []).some((i) => (typeof i === 'string' ? i === name : i.test(name)));
      if (!ignored) {
        if (!name) out.push(`${where}: a control with no accessible name`);
        if (!role) out.push(`${where}: a control with no role`);
        if (!exempt.has(role)) {
          const s = flat(props.style);
          // A scrim that fills the whole screen (StyleSheet.absoluteFill) is as big as a target can be.
          const fillsScreen = s.position === 'absolute' && s.top === 0 && s.bottom === 0 && s.left === 0 && s.right === 0;
          const height = Math.max(s.height ?? 0, s.minHeight ?? 0);
          if (!fillsScreen && height < MIN_TARGET) out.push(`${where}: touch target ${height || 'not sized'} dp tall, needs ${MIN_TARGET}`);
          const width = Math.max(s.width ?? 0, s.minWidth ?? 0);
          if (s.width !== undefined && width < MIN_TARGET) out.push(`${where}: touch target ${width} dp wide, needs ${MIN_TARGET}`);
        }
      }
    }
    if (type === 'TextInput' && !label && !props.accessibilityLabelledBy) out.push(`${where}: a text field with no label`);
    if (type === 'Image' && !label && props.accessible !== false) out.push(`${where}: an image with no description (give it a label, or hide it)`);

    for (const child of node.children ?? []) visit(child, `${where} > `);
  };

  visit(root, '');
  return out;
}
