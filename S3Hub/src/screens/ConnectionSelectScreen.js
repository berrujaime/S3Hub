// src/screens/ConnectionSelectScreen.js

import React, { useContext } from 'react';
import { View, StyleSheet, FlatList, Alert, Image } from 'react-native';
import { Text, List, FAB, IconButton, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { getProvider } from '../domain/providers';
import ProviderSpine, { RegionTag } from '../components/ProviderSpine';
import i18n from '../locales/translations';

export default function ConnectionSelectScreen({ navigation }) {
  const theme = useTheme();
  const { connections, currentConnection, setActiveConnection, deleteConnection } = useContext(AuthContext);

  const handleConnectionSelect = async (connection) => {
    if (connection.accessKey !== currentConnection.accessKey) {
      await setActiveConnection(connection);
      navigation.navigate('BucketsTab');
    }
    else{
      navigation.navigate('BucketsTab');
    }
  };

  const handleAddConnection = () => {
    navigation.navigate('Login');
  };

  const handleDeleteConnection = (connection) => {
    const provider = getProvider(connection.service);
    Alert.alert(
      i18n.t('deleteConnection'),
      `${i18n.t('deleteConnection')} ${provider.name}?`,
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('delete'),
          style: 'destructive',
          onPress: () => {
            deleteConnection(connection.id);
          },
        },
      ]
    );
  };

  const renderConnectionItem = ({ item }) => {
    const isActive = currentConnection && currentConnection.id === item.id;
    const provider = getProvider(item.service);
    // Region/endpoint tag (provider-spine signature, Task 4.5): most
    // providers store a region; the ones with a free-text/fixed endpoint
    // instead (r2, gcs, custom) store it under `endpoint`.
    const regionLabel = item.region || item.endpoint;

    const renderMark = () =>
      provider.logo ? (
        <Image source={provider.logo} style={styles.logo} resizeMode="contain" />
      ) : (
        <MaterialCommunityIcons
          name={provider.icon}
          size={32}
          color={theme.colors.onSurface}
          style={styles.logo}
        />
      );

    return (
      <View style={styles.rowWrapper}>
        <ProviderSpine providerId={item.service} />
        <List.Item
          title={provider.name}
          description={({ color }) => (
            <View>
              <Text variant="bodyMedium" style={{ color }}>
                {i18n.t('accessKey')}: {item.accessKey}
              </Text>
              <RegionTag value={regionLabel} style={styles.regionTag} />
            </View>
          )}
          onPress={() => handleConnectionSelect(item)}
          left={renderMark}
          right={(props) => (
            <View style={styles.actions}>
              {isActive ? <List.Icon {...props} icon="check" color={props.color} /> : null}
              <IconButton
                icon="delete"
                onPress={() => handleDeleteConnection(item)}
              />
            </View>
          )}
        />
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text variant="headlineLarge" style={[styles.title, { color: theme.colors.onBackground }]}>
        {i18n.t('selectConnection')}
      </Text>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.id}
        renderItem={renderConnectionItem}
      />
      <FAB
        style={styles.fab}
        icon="plus"
        onPress={handleAddConnection}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    marginTop: 30,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  // Wraps each row so ProviderSpine (position: 'absolute', anchored to this
  // View) can lay its brand-color bar over the row's left edge without
  // adding to the row's own width/flex layout or touch target.
  rowWrapper: {
    position: 'relative',
  },
  regionTag: {
    marginTop: 2,
  },
  logo: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 64,
  },
});
