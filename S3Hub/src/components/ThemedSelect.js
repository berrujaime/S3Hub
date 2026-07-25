// src/components/ThemedSelect.js
//
// A single-choice select rendered ENTIRELY in JS by react-native-paper, so it
// obeys `useTheme()` like the rest of the app.
//
// It replaces `@react-native-picker/picker`, which could not be themed: on
// Android that Picker opens a native Spinner popup whose background comes from
// the ANDROID theme (light), while the item text color came from the props we
// passed it (this app's dark-mode `onSurface`, a near-white). The result in
// dark mode was a white popup with near-white text — invisible options. No
// combination of `style`/`itemStyle`/`dropdownIconColor` fixes that, because
// the popup surface simply is not ours to style.
//
// Paper's `Menu` has no such split: it renders a themed `Surface`
// (elevation.level2) inside a JS Portal, so both the background and the text
// come from the same theme object. LoginScreen already used this Button+Menu
// pattern for the provider/region pickers, so this component also brings the
// settings screen in line with a control the app already had.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Menu, useTheme } from 'react-native-paper';

/**
 * Button-anchored single-choice select.
 * @param {Object} props
 * @param {Array<{label: string, value: string}>} props.options - Choices, in
 *   display order.
 * @param {string} props.value - Currently selected `value`.
 * @param {(value: string) => void} props.onChange - Called with the chosen
 *   `value`. Not called when the user re-picks the current selection.
 * @param {string} props.accessibilityLabel - What this select chooses (e.g.
 *   "Select language"). The button's visible text is only the current VALUE's
 *   label, which alone doesn't tell a screen-reader user what it controls, so
 *   the announced label combines both.
 * @param {string} [props.testID]
 */
export default function ThemedSelect({ options, value, onChange, accessibilityLabel, testID }) {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();

  const open = () => setVisible(true);
  const close = () => setVisible(false);

  const selected = options.find((option) => option.value === value);
  // Falling back to the raw `value` keeps a stored-but-unknown preference
  // visible (e.g. a locale saved by an older build whose option was since
  // removed) instead of rendering an empty button.
  const buttonLabel = selected ? selected.label : value;

  const handleSelect = (option) => {
    close();
    if (option.value !== value) {
      onChange(option.value);
    }
  };

  return (
    // The anchor View is what Menu measures to position the popup. Without
    // it the Menu would anchor to the Button's own layout box, which
    // `styles.button` stretches to full width — the popup would then be
    // pinned to the screen edge rather than under the control.
    <View style={styles.anchor}>
      <Menu
        visible={visible}
        onDismiss={close}
        anchor={
          <Button
            mode="outlined"
            onPress={open}
            testID={testID}
            accessibilityLabel={`${accessibilityLabel} ${buttonLabel}`}
            // `icon` renders on the LEADING edge in Paper, so the caret is a
            // trailing `contentStyle` reversal instead — matching the affordance
            // the native Picker used to show.
            icon="menu-down"
            contentStyle={styles.buttonContent}
            style={styles.button}
          >
            {buttonLabel}
          </Button>
        }
        // Explicit width keeps the popup as wide as the control instead of
        // sizing to the longest label.
        style={styles.menu}
        contentStyle={{ backgroundColor: theme.colors.elevation.level2 }}
      >
        {options.map((option) => (
          <Menu.Item
            key={option.value}
            onPress={() => handleSelect(option)}
            title={option.label}
            // Marks the active row: Paper's Menu.Item has no `selected` prop,
            // so the check icon is the affordance (same one the bucket and
            // connection rows use for "active").
            trailingIcon={option.value === value ? 'check' : undefined}
          />
        ))}
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    marginBottom: 16,
  },
  button: {
    width: '100%',
  },
  buttonContent: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  menu: {
    // Nudges the popup below the button instead of overlapping it.
    marginTop: 8,
  },
});
