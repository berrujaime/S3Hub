// src/screens/BucketSelectScreen.js

import React, { useEffect, useState, useContext } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Text, List, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { listBuckets } from '../services/s3Service';
import i18n from '../locales/translations';
import { mapS3Error } from '../domain/errors';
import ProviderSpine, { RegionTag } from '../components/ProviderSpine';
import { SCREEN_TOP_SPACING } from '../theme/spacing';

export default function BucketSelectScreen({ navigation }) {
  const { currentConnection, setCurrentBucket } = useContext(AuthContext);
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const theme = useTheme();
  // headerShown: false (see AppNavigator.js's BucketsStack) — this screen
  // sits directly under the status bar, so insets.top replaces the old
  // hardcoded marginTop (Task 5.3). Not needed for the loading state, which
  // is a centered flex:1 spinner with nothing pinned to the top edge.
  const insets = useSafeAreaInsets();
  const containerStyle = [styles.container, { paddingTop: insets.top + SCREEN_TOP_SPACING }];

  useEffect(() => {
    if (currentConnection) {
      fetchBuckets();
    } else {
      setBuckets([]);
      setSelectedBucket(null); // Reset the selection
    }
    // TODO(Task 5.6): include fetchBuckets once auto-nav guard lands
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConnection]);

  const fetchBuckets = async () => {
    try {
      setLoading(true);
      const bucketsList = await listBuckets(currentConnection);
      setBuckets(bucketsList);

      // If there is only one bucket, select it automatically
      if (bucketsList.length === 1) {
        const singleBucket = bucketsList[0];
        setSelectedBucket(singleBucket.Name);
        await setCurrentBucket(singleBucket.Name);
        navigation.navigate('FilesTab');
      }
    } catch (error) {
      console.error("Error fetching the buckets:", error);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
    } finally {
      setLoading(false);
    }
  };

  const handleBucketSelect = async (bucket) => {
    try {
      setSelectedBucket(bucket.Name);
      await setCurrentBucket(bucket.Name);
      navigation.navigate('FilesTab');
    } catch (error) {
      console.error("Error selecting the bucket:", error);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
    }
  };

  // Every bucket in this list belongs to the SAME active connection, so the
  // spine color and region tag (provider-spine signature, Task 4.5) are
  // derived once from `currentConnection` rather than per bucket.
  const activeProviderId = currentConnection?.service;
  const activeRegionLabel = currentConnection?.region || currentConnection?.endpoint;

  const renderBucketItem = ({ item }) => (
    <View style={styles.rowWrapper}>
      <List.Item
        title={item.Name}
        description={() => <RegionTag value={activeRegionLabel} />}
        onPress={() => handleBucketSelect(item)}
        left={(props) => <List.Icon {...props} icon="bucket" />}
        right={() => (
          selectedBucket === item.Name ? <List.Icon icon="check" /> : null
        )}
        style={
          selectedBucket === item.Name
            ? [styles.selectedItem, { backgroundColor: theme.colors.secondaryContainer }]
            : null
        }
      />
      {/* Declared AFTER List.Item on purpose: RN paints later siblings on
          top, and the selected-row highlight above gives List.Item an OPAQUE
          secondaryContainer background that would otherwise cover the spine.
          The spine is pointerEvents="none", so press/ripple on the row are
          unaffected by it sitting on top. */}
      <ProviderSpine providerId={activeProviderId} />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!currentConnection) {
    return (
      <View style={containerStyle}>
        <Text style={[styles.message, { color: theme.colors.onBackground }]}>
          {i18n.t('chooseConnection')}
        </Text>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Text style={[styles.title, { color: theme.colors.onBackground }]}>
        {i18n.t('selectBucket')}
      </Text>
      <FlatList
        data={buckets}
        keyExtractor={(item) => item.Name}
        renderItem={renderBucketItem}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.colors.onSurface }]}>
              {i18n.t('noResults')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 24,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    textAlign: 'center',
    fontSize: 18,
    marginTop: 20,
  },
  selectedItem: {
    // backgroundColor is themed inline (theme.colors.secondaryContainer) at
    // the call site — a pale cyan-ish highlight in both MD3 conventions and
    // this design's own secondary family, so it reads as "selected" without
    // reaching for the amber primary accent (reserved for actions).
  },
  // Wraps each row so ProviderSpine (position: 'absolute', anchored to this
  // View) can lay its brand-color bar over the row's left edge without
  // adding to the row's own width/flex layout or touch target.
  rowWrapper: {
    position: 'relative',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
  },
});
