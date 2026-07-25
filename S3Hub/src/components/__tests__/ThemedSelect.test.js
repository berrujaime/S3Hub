// src/components/__tests__/ThemedSelect.test.js
//
// ThemedSelect replaced @react-native-picker/picker because that Picker's
// Android popup was painted by the NATIVE theme (light background) while its
// item text took the JS theme's near-white onSurface — unreadable in dark
// mode. The regression these tests protect is therefore not just "the menu
// opens" but "the menu's own surface comes from OUR theme".
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import ThemedSelect from '../ThemedSelect';
import { darkTheme } from '../../theme/theme';

const OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
];

const renderSelect = (props = {}) => {
  const onChange = jest.fn();
  render(
    <PaperProvider theme={darkTheme}>
      <ThemedSelect
        options={OPTIONS}
        value="en"
        onChange={onChange}
        accessibilityLabel="Select language"
        testID="lang"
        {...props}
      />
    </PaperProvider>,
  );
  return { onChange };
};

describe('ThemedSelect', () => {
  it("shows the selected option's label on the anchor button", () => {
    renderSelect();
    expect(screen.getByTestId('lang')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('announces what it controls alongside the current value', () => {
    renderSelect();
    // The visible text is only "English", which alone doesn't say what the
    // button changes.
    expect(screen.getByLabelText('Select language English')).toBeTruthy();
  });

  it('falls back to the raw value when it matches no known option', () => {
    renderSelect({ value: 'de' });
    expect(screen.getByText('de')).toBeTruthy();
  });

  it('opens the menu and reports the chosen value', () => {
    const { onChange } = renderSelect();

    fireEvent.press(screen.getByTestId('lang'));
    fireEvent.press(screen.getByText('Español'));

    expect(onChange).toHaveBeenCalledWith('es');
  });

  it('does not fire onChange when the current value is re-picked', () => {
    const { onChange } = renderSelect();

    fireEvent.press(screen.getByTestId('lang'));
    // 'English' now appears twice (anchor + menu item); the menu item is the
    // last match.
    const matches = screen.getAllByText('English');
    fireEvent.press(matches[matches.length - 1]);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("paints the menu surface from the app's own theme, not a native one", () => {
    renderSelect();
    fireEvent.press(screen.getByTestId('lang'));

    // Walk up from a menu item to the Surface carrying an explicit
    // backgroundColor: that value must be one of ours.
    let node = screen.getByText('Español');
    let background;
    while (node && background === undefined) {
      background = StyleSheet.flatten(node.props?.style)?.backgroundColor;
      node = node.parent;
    }

    expect(background).toBe(darkTheme.colors.elevation.level2);
  });
});
