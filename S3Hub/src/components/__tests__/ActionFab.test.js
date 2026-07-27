// src/components/__tests__/ActionFab.test.js
//
// ActionFab owns the app's "amber means action" FAB treatment: every FAB in
// the app is the same filled-amber, shadowless 56dp button, differing only by
// icon. Two of these assertions guard decisions that came from reading
// Paper's source or measuring contrast, not from preference:
//
//  (a) `variant="primary"` must NEVER reach Paper. Paper maps it to
//      theme.colors.primaryContainer / onPrimaryContainer, which this theme
//      does not override, so they fall back to MD3's own purple (#EADDFF).
//      This is the same class of bug theme.js:50-58 documents for
//      react-navigation's `card`.
//  (b) `mode="flat"` is what removes the drop shadow. Paper's FAB derives its
//      MD3 elevation as `isFlatMode || disabled ? 0 : 3` (FAB.js:126,138), so
//      the mode prop is the supported way to get a flat button — not a
//      shadowOpacity/elevation style override, which would have to fight
//      Paper's own Surface elevation on every platform separately.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Provider as PaperProvider, FAB } from 'react-native-paper';
import ActionFab from '../ActionFab';
import { darkTheme, lightTheme } from '../../theme/theme';

const renderFab = (props = {}, theme = darkTheme) => {
  const onPress = jest.fn();
  render(
    <PaperProvider theme={theme}>
      <ActionFab icon="upload" onPress={onPress} accessibilityLabel="Upload files" {...props} />
    </PaperProvider>,
  );
  return { onPress, fab: screen.UNSAFE_getByType(FAB) };
};

describe('ActionFab', () => {
  it('paints the button with the theme accent', () => {
    const { fab } = renderFab();

    expect(StyleSheet.flatten(fab.props.style).backgroundColor).toBe(darkTheme.colors.primary);
    expect(fab.props.color).toBe(darkTheme.colors.onPrimary);
  });

  it('takes its accent from whichever theme is active', () => {
    // The amber differs between themes (#AD610E light / #E8973A dark); the
    // component must read it rather than carry either literal.
    const { fab } = renderFab({}, lightTheme);

    expect(StyleSheet.flatten(fab.props.style).backgroundColor).toBe(lightTheme.colors.primary);
    expect(fab.props.color).toBe(lightTheme.colors.onPrimary);
  });

  it('renders flat, with no drop shadow', () => {
    // The shadow read as artificial on device. See (b) above for why this is
    // a mode prop rather than a style override.
    expect(renderFab().fab.props.mode).toBe('flat');
  });

  it('renders at the default 56dp size', () => {
    // Paper's default FAB size is 'medium' (56dp). Every FAB in the app is
    // this size, so the component sets no size and there is no small variant.
    expect(renderFab().fab.props.size).toBeUndefined();
  });

  it('never asks Paper for the purple primaryContainer variant', () => {
    expect(renderFab().fab.props.variant).not.toBe('primary');
  });

  it("does not let a caller's variant prop reach Paper", () => {
    // Regression for the trap the WARNING block in ActionFab documents:
    // variant="primary" must never reach Paper even when a caller passes it
    // straight to ActionFab.
    expect(renderFab({ variant: 'primary' }).fab.props.variant).not.toBe('primary');
  });

  it("does not let a caller's color prop override the icon color", () => {
    const { fab } = renderFab({ color: 'rebeccapurple' });

    expect(fab.props.color).toBe(darkTheme.colors.onPrimary);
  });

  it("does not let a caller's mode prop reinstate the shadow", () => {
    expect(renderFab({ mode: 'elevated' }).fab.props.mode).toBe('flat');
  });

  it("merges a caller's positioning style over its own background", () => {
    const { fab } = renderFab({ style: { position: 'absolute', bottom: 64 } });
    const flattened = StyleSheet.flatten(fab.props.style);

    // Positioning is screen layout, not button identity, so the caller owns
    // it -- but it must not cost the FAB its color.
    expect(flattened.bottom).toBe(64);
    expect(flattened.backgroundColor).toBe(darkTheme.colors.primary);
  });

  it('forwards press handling and the accessibility label', () => {
    const { onPress } = renderFab();

    fireEvent.press(screen.getByLabelText('Upload files'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('forwards the disabled state', () => {
    const { fab } = renderFab({ disabled: true });

    expect(fab.props.disabled).toBe(true);
  });
});
