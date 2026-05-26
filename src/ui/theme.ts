/**
 * Default look-and-feel for the bundled UI components.
 *
 * Override per-component via the `theme` prop, or wrap the SDK components in
 * your own and ignore these entirely.
 */
export interface CallTheme {
  primary: string;
  background: string;
  text: string;
  subtext: string;
  answer: string;
  decline: string;
  controlOnBg: string;
  controlOffBg: string;
  controlIconOn: string;
  controlIconOff: string;
}

export const defaultTheme: CallTheme = {
  primary: '#2D6BFF',
  background: '#fafafa',
  text: '#111',
  subtext: '#555',
  answer: '#33c124',
  decline: '#ff2d2d',
  controlOnBg: '#111',
  controlOffBg: '#fff',
  controlIconOn: '#fff',
  controlIconOff: '#111',
};

export function mergeTheme(override?: Partial<CallTheme>): CallTheme {
  if (!override) return defaultTheme;
  return { ...defaultTheme, ...override };
}
