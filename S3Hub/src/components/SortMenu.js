// src/components/SortMenu.js
//
// Icon-anchored menu for choosing the file-listing sort criterion, with the
// direction folded into the same gesture: tapping the ACTIVE criterion
// reverses it, tapping an inactive one switches to it in that criterion's
// natural direction (domain/fileSorting.defaultDirectionFor, applied by
// AuthContext.changeSortCriterion).
//
// Deliberately NOT a variant of ThemedSelect:
//  - ThemedSelect is shaped for Settings rows (width: '100%', marginBottom,
//    outlined full-width Button anchor). An icon anchor would make its
//    anchor, styles, label and width all conditional.
//  - ThemedSelect deliberately does NOT fire onChange when the current value
//    is re-picked. Here that re-pick IS the toggle gesture -- the exact
//    inverse contract.
//
// No contentStyle needed: Paper's Menu already takes its background from
// theme.colors.elevation.level2 by default (Menu.tsx, elevation = 2), so
// there is no native/JS theming split to paper over.
import React, { useState } from 'react';
import { IconButton, Menu } from 'react-native-paper';
import i18n from '../locales/translations';
import { SORT_CRITERIA, resolveSortCriterion } from '../domain/fileSorting';

// One i18n key per criterion, so adding a criterion in the domain module
// fails loudly here rather than rendering a blank row.
const LABEL_KEYS = {
  type: 'sortByType',
  name: 'sortByName',
  modified: 'sortByModified',
};

/**
 * Sort control for the file listing.
 * @param {Object} props
 * @param {string} props.criterion - Active criterion.
 * @param {string} props.direction - Active direction ('asc' | 'desc').
 * @param {(criterion: string) => void} props.onChangeCriterion - Called when
 *   a DIFFERENT criterion is chosen.
 * @param {() => void} props.onToggleDirection - Called when the active
 *   criterion is re-picked.
 * @param {string} [props.testID]
 */
export default function SortMenu({
  criterion,
  direction,
  onChangeCriterion,
  onToggleDirection,
  testID,
}) {
  const [visible, setVisible] = useState(false);
  const close = () => setVisible(false);

  // Resolved rather than trusted: a preference written by a future build
  // would otherwise render a row with no label and mark nothing as active.
  const activeCriterion = resolveSortCriterion(criterion);
  const isAscending = direction !== 'desc';
  const directionLabel = i18n.t(isAscending ? 'sortAscending' : 'sortDescending');

  const handlePress = (value) => {
    close();
    if (value === activeCriterion) {
      onToggleDirection();
    } else {
      onChangeCriterion(value);
    }
  };

  return (
    <Menu
      visible={visible}
      onDismiss={close}
      anchor={
        <IconButton
          icon="sort"
          onPress={() => setVisible(true)}
          testID={testID}
          // The icon alone says neither what it sorts nor how it is sorted
          // right now, so the announced label carries both.
          accessibilityLabel={`${i18n.t('sortBy')} ${i18n.t(
            LABEL_KEYS[activeCriterion],
          )} ${directionLabel}`}
        />
      }
    >
      {SORT_CRITERIA.map((value) => {
        const isActive = value === activeCriterion;
        const label = i18n.t(LABEL_KEYS[value]);
        return (
          <Menu.Item
            key={value}
            testID={testID ? `${testID}-item-${value}` : undefined}
            onPress={() => handlePress(value)}
            title={label}
            // Only the active row carries an arrow; it doubles as the
            // affordance for "tap me again to reverse".
            trailingIcon={isActive ? (isAscending ? 'arrow-up' : 'arrow-down') : undefined}
            accessibilityLabel={isActive ? `${label} ${directionLabel}` : label}
          />
        );
      })}
    </Menu>
  );
}
