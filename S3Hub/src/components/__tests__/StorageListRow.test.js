// src/components/__tests__/StorageListRow.test.js
//
// StorageListRow exists so the connection list and the bucket list cannot
// drift apart again (they had: different leading-mark alignment, and only the
// bucket rows highlighted the active row). These tests pin the shared
// treatment itself; the per-screen tests cover what each screen passes in.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native-paper';
import { Provider as PaperProvider } from 'react-native-paper';
import StorageListRow from '../StorageListRow';
import { darkTheme } from '../../theme/theme';
import { PROVIDERS } from '../../domain/providers';

const renderRow = (props = {}) => {
  const onPress = jest.fn();
  render(
    <PaperProvider theme={darkTheme}>
      <StorageListRow
        title="my-bucket"
        regionLabel="us-east-1"
        providerId="aws"
        onPress={onPress}
        testID="row"
        {...props}
      />
    </PaperProvider>,
  );
  return { onPress };
};

describe('StorageListRow', () => {
  it('renders the title and the monospace region tag', () => {
    renderRow();
    expect(screen.getByText('my-bucket')).toBeTruthy();
    expect(screen.getByTestId('region-tag')).toBeTruthy();
    expect(screen.getByText('us-east-1')).toBeTruthy();
  });

  it('omits the region tag when there is no region or endpoint', () => {
    renderRow({ regionLabel: undefined });
    expect(screen.queryByTestId('region-tag')).toBeNull();
  });

  it('reports presses', () => {
    const { onPress } = renderRow();
    fireEvent.press(screen.getByText('my-bucket'));
    expect(onPress).toHaveBeenCalled();
  });

  it('carries the provider spine tinted from the registry', () => {
    renderRow();
    const spine = screen.getByTestId('provider-spine');
    expect(StyleSheet.flatten(spine.props.style).backgroundColor).toBe(PROVIDERS.aws.brandColor);
  });

  it('highlights the selected row and announces the state', () => {
    renderRow({ selected: true });
    const row = screen.getByTestId('row');

    expect(StyleSheet.flatten(row.props.style).backgroundColor).toBe(
      darkTheme.colors.secondaryContainer,
    );
    expect(row.props.accessibilityState.selected).toBe(true);
  });

  it('leaves an unselected row unhighlighted', () => {
    renderRow();
    const row = screen.getByTestId('row');

    expect(StyleSheet.flatten(row.props.style)?.backgroundColor).toBeUndefined();
    expect(row.props.accessibilityState.selected).toBe(false);
  });

  it('coerces a null `selected` to false instead of crashing the native side', () => {
    // Regression: a caller computing `selected` as `currentConnection && ...`
    // yields null when there is no active connection (exactly what logout
    // does). The `= false` default only covers undefined, so null used to
    // reach accessibilityState and throw "expected dynamic type 'boolean',
    // but had type 'null'", taking the whole connections screen down.
    renderRow({ selected: null });
    const row = screen.getByTestId('row');

    expect(row.props.accessibilityState.selected).toBe(false);
    expect(StyleSheet.flatten(row.props.style)?.backgroundColor).toBeUndefined();
  });

  it('renders the caller-supplied detail line and actions', () => {
    renderRow({
      renderDetail: ({ color }) => <Text style={{ color }}>Access Key: AKIA</Text>,
      renderActions: () => <Text>delete</Text>,
    });

    expect(screen.getByText('Access Key: AKIA')).toBeTruthy();
    expect(screen.getByText('delete')).toBeTruthy();
  });
});
