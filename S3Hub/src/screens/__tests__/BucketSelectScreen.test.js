// src/screens/__tests__/BucketSelectScreen.test.js
//
// Regression test for the provider-spine stacking bug: List.Item's
// selected-row highlight paints an OPAQUE secondaryContainer background on
// its outermost view, and React Native paints later-declared siblings on
// top of earlier ones — so a spine declared BEFORE List.Item vanished under
// any selected row's background. The spine must therefore be the LAST child
// of each row wrapper. Mere presence-in-tree would not catch this (the
// spine was always in the tree, just painted under), so these tests assert
// declaration order, which is what determines RN paint order.
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import BucketSelectScreen from '../BucketSelectScreen';
import { AuthContext } from '../../context/AuthContext';
import { listBuckets } from '../../services/s3Service';
import { darkTheme } from '../../theme/theme';
import { PROVIDERS } from '../../domain/providers';

// Explicit factories (same rationale as useFileList.test.js): s3Service
// pulls in @aws-sdk/*, and AuthContext's module-level import of
// connectionRepository pulls in AsyncStorage/SecureStore native modules —
// none of which load outside a device runtime. The test only needs the
// AuthContext *object* (to provide its own value), never the real provider.
jest.mock('../../services/s3Service', () => ({
  listBuckets: jest.fn(),
}));
jest.mock('../../data/connectionRepository', () => ({}));

const CONNECTION = {
  id: 'conn-1',
  service: 'aws',
  region: 'eu-west-1',
  accessKey: 'AKIA-TEST',
};

// Two buckets: a single bucket would trigger the auto-select + auto-navigate
// branch and never show a plain list.
const BUCKETS = [{ Name: 'bucket-a' }, { Name: 'bucket-b' }];

const renderScreen = () => {
  const navigation = { navigate: jest.fn() };
  const setCurrentBucket = jest.fn().mockResolvedValue(undefined);
  render(
    <PaperProvider theme={darkTheme}>
      <AuthContext.Provider value={{ currentConnection: CONNECTION, setCurrentBucket }}>
        <BucketSelectScreen navigation={navigation} />
      </AuthContext.Provider>
    </PaperProvider>
  );
  return { navigation, setCurrentBucket };
};

// Walks the rendered host-component JSON tree and returns the parent node
// (the row wrapper) of every element carrying the given testID.
const findParentsOfTestId = (node, testID, parent = null, results = []) => {
  if (!node || typeof node === 'string') return results;
  if (Array.isArray(node)) {
    node.forEach((child) => findParentsOfTestId(child, testID, parent, results));
    return results;
  }
  if (node.props && node.props.testID === testID) results.push(parent);
  (node.children || []).forEach((child) =>
    findParentsOfTestId(child, testID, node, results)
  );
  return results;
};

// True if the JSON subtree contains a node whose flattened style has the
// given backgroundColor (used to prove the opaque selected highlight is on).
const hasBackgroundColor = (node, color) => {
  if (!node || typeof node === 'string') return false;
  if (Array.isArray(node)) return node.some((child) => hasBackgroundColor(child, color));
  const flat = StyleSheet.flatten(node.props && node.props.style);
  if (flat && flat.backgroundColor === color) return true;
  return (node.children || []).some((child) => hasBackgroundColor(child, color));
};

const expectSpineIsLastChildOfEveryRow = () => {
  const wrappers = findParentsOfTestId(screen.toJSON(), 'provider-spine');
  expect(wrappers).toHaveLength(BUCKETS.length);
  wrappers.forEach((wrapper) => {
    const children = wrapper.children.filter((child) => typeof child !== 'string');
    expect(children[children.length - 1].props.testID).toBe('provider-spine');
  });
};

describe('BucketSelectScreen provider spine stacking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listBuckets.mockResolvedValue(BUCKETS);
  });

  it('renders one spine per bucket row, declared last so it paints above the row', async () => {
    renderScreen();
    await screen.findByText('bucket-a');

    expectSpineIsLastChildOfEveryRow();
  });

  it('keeps the spine painted on top of the selected row (opaque highlight active)', async () => {
    const { setCurrentBucket } = renderScreen();
    await screen.findByText('bucket-a');

    fireEvent.press(screen.getByText('bucket-a'));
    await waitFor(() => expect(setCurrentBucket).toHaveBeenCalledWith('bucket-a'));

    // The regression scenario is live: the selected row now carries the
    // opaque secondaryContainer background...
    expect(hasBackgroundColor(screen.toJSON(), darkTheme.colors.secondaryContainer)).toBe(true);
    // ...and every spine is still the last-declared child of its row
    // wrapper, i.e. painted on top of that background rather than under it.
    expectSpineIsLastChildOfEveryRow();
  });

  it("tints the spines with the active connection's provider brand color", async () => {
    renderScreen();
    await screen.findByText('bucket-a');

    screen.getAllByTestId('provider-spine').forEach((spine) => {
      expect(StyleSheet.flatten(spine.props.style).backgroundColor).toBe(
        PROVIDERS.aws.brandColor
      );
    });
  });
});

// Regression tests for Task 5.6: the single-bucket auto-navigate used to fire
// on every re-run of the effect that fetches buckets (any `currentConnection`
// change, including a same-connection object recreated with the same id),
// bouncing the user straight back to Files whenever they tried to stay on
// the Buckets tab. It must now fire (a) at most once per connection id and
// (b) only while the Buckets tab is focused — bottom-tabs keeps blurred
// screens mounted, so a background connection change (e.g. deleteConnection
// auto-activating the next connection while the user is on the Connections
// tab) re-runs the fetch here and must NOT yank the user to Files.
describe('BucketSelectScreen single-bucket auto-navigation guard', () => {
  const SINGLE_BUCKET = [{ Name: 'only-bucket' }];

  const connectionA = { id: 'conn-a', service: 'aws', region: 'eu-west-1', accessKey: 'A' };
  const connectionB = { id: 'conn-b', service: 'storj', region: 'us1', accessKey: 'B' };

  const renderWithConnection = (connection, { navigation, setCurrentBucket }) =>
    render(
      <PaperProvider theme={darkTheme}>
        <AuthContext.Provider value={{ currentConnection: connection, setCurrentBucket }}>
          <BucketSelectScreen navigation={navigation} />
        </AuthContext.Provider>
      </PaperProvider>
    );

  beforeEach(() => {
    jest.clearAllMocks();
    listBuckets.mockResolvedValue(SINGLE_BUCKET);
  });

  it('auto-navigates once per connection: not again on a re-render of the same connection, but again after switching connections', async () => {
    const navigation = { navigate: jest.fn(), isFocused: jest.fn(() => true) };
    const setCurrentBucket = jest.fn().mockResolvedValue(undefined);

    const { rerender } = renderWithConnection(connectionA, { navigation, setCurrentBucket });

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('FilesTab'));
    expect(navigation.navigate).toHaveBeenCalledTimes(1);

    // Re-render for the SAME connection id, but with a brand-new object
    // reference (e.g. a context value recompute elsewhere in the app) — the
    // effect re-runs (fetchBuckets refreshes) but must NOT re-navigate.
    rerender(
      <PaperProvider theme={darkTheme}>
        <AuthContext.Provider
          value={{ currentConnection: { ...connectionA }, setCurrentBucket }}
        >
          <BucketSelectScreen navigation={navigation} />
        </AuthContext.Provider>
      </PaperProvider>
    );

    await waitFor(() => expect(listBuckets).toHaveBeenCalledTimes(2));
    expect(navigation.navigate).toHaveBeenCalledTimes(1);

    // Switching to a DIFFERENT connection (also single-bucket) must
    // auto-navigate again.
    rerender(
      <PaperProvider theme={darkTheme}>
        <AuthContext.Provider value={{ currentConnection: connectionB, setCurrentBucket }}>
          <BucketSelectScreen navigation={navigation} />
        </AuthContext.Provider>
      </PaperProvider>
    );

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledTimes(2));
    expect(navigation.navigate).toHaveBeenNthCalledWith(2, 'FilesTab');
  });

  it('does not auto-navigate while the tab is not focused, and stays armed for the next focused fetch', async () => {
    const navigation = { navigate: jest.fn(), isFocused: jest.fn(() => false) };
    const setCurrentBucket = jest.fn().mockResolvedValue(undefined);

    const { rerender } = renderWithConnection(connectionA, { navigation, setCurrentBucket });

    // The background fetch completes and still auto-SELECTS the single
    // bucket (selection is not gated on focus)...
    await waitFor(() => expect(setCurrentBucket).toHaveBeenCalledWith('only-bucket'));
    // ...but never navigates: the user is on another tab (e.g. mid-delete
    // on the Connections tab when deleteConnection auto-activated this
    // connection).
    expect(navigation.navigate).not.toHaveBeenCalled();

    // The skipped nav did NOT record the connection id, so the auto-nav is
    // still armed: the next fetch that completes while the tab IS focused
    // (same connection id, new object reference re-running the effect)
    // fires it.
    navigation.isFocused.mockReturnValue(true);
    rerender(
      <PaperProvider theme={darkTheme}>
        <AuthContext.Provider
          value={{ currentConnection: { ...connectionA }, setCurrentBucket }}
        >
          <BucketSelectScreen navigation={navigation} />
        </AuthContext.Provider>
      </PaperProvider>
    );

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('FilesTab'));
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
  });
});
