// src/components/__tests__/SortMenu.test.js
//
// The gesture that makes this component distinct from ThemedSelect: tapping
// the ALREADY-ACTIVE criterion reverses the direction. ThemedSelect
// deliberately does the opposite (it swallows a re-pick of the current
// value), which is why this is its own component rather than a variant.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Provider as PaperProvider, Menu } from 'react-native-paper';
import SortMenu from '../SortMenu';
import { darkTheme } from '../../theme/theme';
import i18n from '../../locales/translations';

const renderMenu = (props = {}) => {
  const onChangeCriterion = jest.fn();
  const onToggleDirection = jest.fn();
  render(
    <PaperProvider theme={darkTheme}>
      <SortMenu
        criterion="type"
        direction="asc"
        onChangeCriterion={onChangeCriterion}
        onToggleDirection={onToggleDirection}
        testID="sort"
        {...props}
      />
    </PaperProvider>,
  );
  const open = () => fireEvent.press(screen.getByTestId('sort'));
  return { onChangeCriterion, onToggleDirection, open };
};

// The `testID` passed to Menu.Item lands on a wrapper element rather than
// the Menu.Item itself, so `getByTestId(...).props.trailingIcon` is always
// undefined regardless of which row it is. Querying by rendered element
// type and matching on `title` reaches the actual Menu.Item props instead.
const findItemByTitle = (title) =>
  screen.UNSAFE_getAllByType(Menu.Item).find((item) => item.props.title === title);

describe('SortMenu', () => {
  beforeEach(() => {
    i18n.locale = 'en';
  });

  it('renders one item per criterion', () => {
    const { open } = renderMenu();
    open();

    expect(screen.getByText('File type')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Date modified')).toBeTruthy();
  });

  it('marks the active criterion with an up arrow when ascending', () => {
    const { open } = renderMenu({ criterion: 'name', direction: 'asc' });
    open();

    expect(findItemByTitle('Name').props.trailingIcon).toBe('arrow-up');
  });

  it('marks the active criterion with a down arrow when descending', () => {
    const { open } = renderMenu({ criterion: 'name', direction: 'desc' });
    open();

    expect(findItemByTitle('Name').props.trailingIcon).toBe('arrow-down');
  });

  it('leaves inactive criteria without a trailing icon', () => {
    const { open } = renderMenu({ criterion: 'name', direction: 'asc' });
    open();

    expect(findItemByTitle('File type').props.trailingIcon).toBeUndefined();
    expect(findItemByTitle('Date modified').props.trailingIcon).toBeUndefined();
  });

  it('toggles the direction when the ACTIVE criterion is tapped', () => {
    const { onChangeCriterion, onToggleDirection, open } = renderMenu({ criterion: 'name' });
    open();

    fireEvent.press(screen.getByText('Name'));

    expect(onToggleDirection).toHaveBeenCalledTimes(1);
    expect(onChangeCriterion).not.toHaveBeenCalled();
  });

  it('switches criterion when an INACTIVE one is tapped', () => {
    const { onChangeCriterion, onToggleDirection, open } = renderMenu({ criterion: 'name' });
    open();

    fireEvent.press(screen.getByText('Date modified'));

    expect(onChangeCriterion).toHaveBeenCalledWith('modified');
    expect(onToggleDirection).not.toHaveBeenCalled();
  });

  it('announces what it controls plus the current criterion and direction', () => {
    renderMenu({ criterion: 'modified', direction: 'desc' });

    // The visible affordance is a bare sort icon, which alone says neither
    // what it sorts nor how it is sorted right now.
    expect(screen.getByLabelText('Sort by Date modified Descending')).toBeTruthy();
  });

  it('survives a corrupt criterion without crashing', () => {
    const { open } = renderMenu({ criterion: 'size' });
    open();

    // Resolved through the domain fallback, so a preference from a future
    // build renders as the default rather than an empty label.
    expect(findItemByTitle('File type').props.trailingIcon).toBe('arrow-up');
  });
});
