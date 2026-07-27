// src/screens/ConnectionSelectScreen.js

import React, { useContext } from 'react';
import { View, StyleSheet, FlatList, Alert, Image } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { getProvider } from '../domain/providers';
import StorageListRow from '../components/StorageListRow';
import ScreenTitle from '../components/ScreenTitle';
import ActionFab from '../components/ActionFab';
import { SCREEN_TOP_SPACING } from '../theme/spacing';
import i18n from '../locales/translations';

export default function ConnectionSelectScreen({ navigation }) {
  const theme = useTheme();
  // headerShown: false (see AppNavigator.js's ConnectionsStack) — this
  // screen sits directly under the status bar, so insets.top replaces the
  // old hardcoded marginTop (Task 5.3).
  const insets = useSafeAreaInsets();
  const { connections, currentConnection, setActiveConnection, deleteConnection } =
    useContext(AuthContext);

  const handleConnectionSelect = async (connection) => {
    // Compare by `id` (stable per Tasks 1.5/1.6), not `accessKey` (not
    // guaranteed unique, and irrelevant to "is this already active").
    // `currentConnection` can be null (no active connection yet), hence the
    // optional chaining. Re-setting the already-active connection is
    // skipped, not just redundant: setActiveConnection() unconditionally
    // resets currentBucket to null, which would needlessly kick the user
    // out of an already-selected bucket for no actual connection change.
    if (currentConnection?.id !== connection.id) {
      await setActiveConnection(connection);
    }
    navigation.navigate('BucketsTab');
  };

  const handleAddConnection = () => {
    navigation.navigate('Login');
  };

  const handleDeleteConnection = (connection) => {
    const provider = getProvider(connection.service);
    Alert.alert(i18n.t('deleteConnection'), `${i18n.t('deleteConnection')} ${provider.name}?`, [
      { text: i18n.t('cancel'), style: 'cancel' },
      {
        text: i18n.t('delete'),
        style: 'destructive',
        onPress: () => {
          deleteConnection(connection.id);
        },
      },
    ]);
  };

  const renderConnectionItem = ({ item }) => {
    // Boolean(), not a bare `&&` chain: with no active connection (right after
    // logout, or on a fresh install) `currentConnection && ...` evaluates to
    // null, and a null reaches React Native's accessibilityState as a non-
    // boolean — "expected dynamic type 'boolean', but had type 'null'".
    const isActive = Boolean(currentConnection && currentConnection.id === item.id);
    const provider = getProvider(item.service);
    // Region/endpoint tag (provider-spine signature, Task 4.5): most
    // providers store a region; the ones with a free-text/fixed endpoint
    // instead (r2, gcs, custom) store it under `endpoint`.
    const regionLabel = item.region || item.endpoint;

    return (
      <StorageListRow
        title={provider.name}
        regionLabel={regionLabel}
        providerId={item.service}
        selected={isActive}
        onPress={() => handleConnectionSelect(item)}
        renderMark={({ color }) =>
          provider.logo ? (
            <Image source={provider.logo} style={styles.logo} resizeMode="contain" />
          ) : (
            <MaterialCommunityIcons name={provider.icon} size={24} color={color} />
          )
        }
        renderDetail={({ color }) => (
          <Text variant="bodyMedium" numberOfLines={1} style={{ color }}>
            {i18n.t('accessKey')}: {item.accessKey}
          </Text>
        )}
        renderActions={() => (
          <IconButton
            icon="delete"
            onPress={() => handleDeleteConnection(item)}
            accessibilityLabel={i18n.t('deleteConnection')}
          />
        )}
      />
    );
  };

  // First-run empty state (Task 5.8): shown via FlatList's ListEmptyComponent
  // instead of a blank list when there are no saved connections yet. The
  // hint points at the add FAB rather than duplicating its action, since the
  // FAB itself is the only way to add a connection from this screen.
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons
        name="cloud-off-outline"
        size={64}
        color={theme.colors.onSurfaceVariant}
      />
      <Text variant="titleMedium" style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>
        {i18n.t('noConnectionsTitle')}
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.emptyHint, { color: theme.colors.onSurfaceVariant }]}
      >
        {i18n.t('noConnectionsHint')}
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, paddingTop: insets.top + SCREEN_TOP_SPACING },
      ]}
    >
      <ScreenTitle>{i18n.t('selectConnection')}</ScreenTitle>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.id}
        renderItem={renderConnectionItem}
        ListEmptyComponent={renderEmptyState}
      />
      <ActionFab
        style={styles.fab}
        icon="plus"
        onPress={handleAddConnection}
        accessibilityLabel={i18n.t('addConnection')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 16,
    textAlign: 'center',
  },
  emptyHint: {
    marginTop: 8,
    textAlign: 'center',
  },
  // Sized to match the 24dp MaterialCommunityIcons glyph the icon-based
  // providers render, so logo and icon providers occupy the same slot inside
  // StorageListRow's mark box.
  logo: {
    width: 24,
    height: 24,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 64,
  },
});
