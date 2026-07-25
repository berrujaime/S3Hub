// src/components/StorageListRow.js
//
// The shared row for the two "pick a storage target" lists: connections and
// buckets. Both had grown their own copy of the provider-spine wrapper, the
// region tag and the active-row treatment, and the copies had drifted — the
// bucket rows aligned their leading icon through Paper's `List.Icon` slot and
// highlighted the active row with a filled `secondaryContainer` background,
// while the connection rows placed a bare 32dp image with an ad-hoc
// `marginRight` and marked "active" with nothing but a check glyph. Same list
// idiom, two different-looking screens.
//
// This component is the bucket treatment (the one kept) made reusable, so the
// two screens can only ever look the same. What stays per-screen is genuinely
// per-screen: which mark to draw on the left (a provider logo vs. a bucket
// glyph) and which actions to hang on the right (a delete button vs. nothing).
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { List, useTheme } from 'react-native-paper';
import ProviderSpine, { RegionTag } from './ProviderSpine';

// Matches Paper's own List.Icon box (24dp glyph in a 40dp slot), so a custom
// mark passed by a caller lines up with rows that use List.Icon instead.
const MARK_SIZE = 40;

/**
 * One selectable storage row: provider spine, leading mark, title, monospace
 * region/endpoint tag, optional extra description line, and trailing actions.
 * @param {Object} props
 * @param {string} props.title - Primary label (bucket name / provider name).
 * @param {string} [props.regionLabel] - Region or endpoint for the mono tag.
 * @param {string} [props.providerId] - Registry id driving the spine color.
 * @param {boolean} [props.selected] - Renders the active-row highlight and
 *   announces itself as selected.
 * @param {() => void} props.onPress
 * @param {(props: {color: string}) => React.ReactNode} [props.renderMark] -
 *   Leading mark. Receives the themed icon color. Defaults to no mark.
 * @param {(props: {color: string}) => React.ReactNode} [props.renderActions] -
 *   Trailing actions, drawn after the selected-check.
 * @param {(props: {color: string}) => React.ReactNode} [props.renderDetail] -
 *   Extra description line ABOVE the region tag (e.g. an access key).
 * @param {string} [props.testID]
 */
export default function StorageListRow({
  title,
  regionLabel,
  providerId,
  selected = false,
  onPress,
  renderMark,
  renderActions,
  renderDetail,
  testID,
}) {
  const theme = useTheme();

  // Coerced, not just defaulted: the `selected = false` default above only
  // applies to `undefined`, so a caller computing it with a `&&` chain over a
  // possibly-null value (`currentConnection && ...`) would hand us null — and
  // null reaches React Native's accessibilityState as a non-boolean, which
  // throws "expected dynamic type 'boolean', but had type 'null'" and takes
  // the whole screen down. Callers pass booleans now; this keeps a future one
  // from crashing the list.
  const isSelected = Boolean(selected);

  const renderLeft = renderMark
    ? () => <View style={styles.mark}>{renderMark({ color: theme.colors.onSurface })}</View>
    : undefined;

  const renderRight = (rightProps) => (
    <View style={styles.actions}>
      {isSelected ? <List.Icon {...rightProps} icon="check" color={theme.colors.primary} /> : null}
      {renderActions ? renderActions({ color: theme.colors.onSurfaceVariant }) : null}
    </View>
  );

  return (
    <View style={styles.rowWrapper}>
      <List.Item
        testID={testID}
        title={title}
        // A function `description` bypasses Paper's descriptionNumberOfLines
        // clamp, so each line clamps itself instead (RegionTag already limits
        // itself to one line).
        description={({ color }) => (
          <View>
            {renderDetail ? renderDetail({ color }) : null}
            <RegionTag value={regionLabel} />
          </View>
        )}
        onPress={onPress}
        left={renderLeft}
        right={renderRight}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        style={isSelected ? { backgroundColor: theme.colors.secondaryContainer } : null}
      />
      {/* Declared AFTER List.Item on purpose: RN paints later siblings on
          top, and the selected-row highlight above gives List.Item an OPAQUE
          secondaryContainer background that would otherwise cover the spine.
          The spine is pointerEvents="none", so press/ripple on the row are
          unaffected by it sitting on top. */}
      <ProviderSpine providerId={providerId} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Anchors the absolutely-positioned ProviderSpine to this row rather than
  // the screen. The padding pushes row content clear of the spine bar
  // (absolute children ignore parent padding, so the bar itself stays glued
  // to the left edge).
  rowWrapper: {
    position: 'relative',
    paddingLeft: 8,
  },
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
