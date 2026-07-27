// src/components/__tests__/ActionFab.test.js
//
// ActionFab owns the app's "amber means action" FAB treatment. Two of these
// assertions guard traps that measurement/source-reading surfaced, not
// preferences:
//
//  (a) `variant="primary"` must NEVER be used. Paper maps it to
//      theme.colors.primaryContainer / onPrimaryContainer, which this theme
//      does not override, so they fall back to MD3's own purple (#EADDFF).
//      This is the same class of bug theme.js:50-58 documents for
//      react-navigation's `card`.
//  (b) The small (secondary) FAB needs an explicit primary-colored border.
//      Its variant="surface" background (elevation.level3) sits at 1.11:1
//      against the page background in light mode — invisible AS A BUTTON,
//      only the icon reads. WCAG 1.4.11 wants 3:1 for a control boundary;
//      the amber border measures 4.35:1 light / 8.03:1 dark.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Provider as PaperProvider, FAB } from 'react-native-paper';
import ActionFab from '../ActionFab';
import { darkTheme } from '../../theme/theme';

const renderFab = (props = {}) => {
  const onPress = jest.fn();
  render(
    <PaperProvider theme={darkTheme}>
      <ActionFab icon="upload" onPress={onPress} accessibilityLabel="Upload files" {...props} />
    </PaperProvider>,
  );
  return { onPress, fab: screen.UNSAFE_getByType(FAB) };
};

describe('ActionFab', () => {
  it('paints the primary prominence with the theme accent', () => {
    const { fab } = renderFab();

    expect(StyleSheet.flatten(fab.props.style).backgroundColor).toBe(darkTheme.colors.primary);
    expect(fab.props.color).toBe(darkTheme.colors.onPrimary);
  });

  it('renders the secondary prominence as a small surface FAB', () => {
    const { fab } = renderFab({ prominence: 'secondary' });

    expect(fab.props.size).toBe('small');
    expect(fab.props.variant).toBe('surface');
  });

  it('gives the secondary prominence a visible accent boundary', () => {
    const { fab } = renderFab({ prominence: 'secondary' });
    const flattened = StyleSheet.flatten(fab.props.style);

    expect(flattened.borderWidth).toBe(1);
    expect(flattened.borderColor).toBe(darkTheme.colors.primary);
  });

  it('never asks Paper for the purple primaryContainer variant', () => {
    expect(renderFab().fab.props.variant).not.toBe('primary');
    expect(renderFab({ prominence: 'secondary' }).fab.props.variant).not.toBe('primary');
  });

  it("does not let a caller's variant/color props reach Paper", () => {
    // Regression for the trap the WARNING block documents: variant="primary"
    // must never reach Paper, even if a caller passes it directly to
    // ActionFab -- for BOTH prominences, not just the component's own
    // defaults (covered by the test above).
    expect(renderFab({ variant: 'primary' }).fab.props.variant).not.toBe('primary');
    expect(renderFab({ prominence: 'secondary', variant: 'primary' }).fab.props.variant).not.toBe(
      'primary',
    );
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
