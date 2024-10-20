// src/screens/BucketSelectScreen.js

import React, { useEffect, useState, useContext } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Text, List } from 'react-native-paper';
import { AuthContext } from '../context/AuthContext';
import { listBuckets } from '../services/s3Service';
import i18n from '../locales/translations';

export default function BucketSelectScreen({ navigation }) {
  const { currentConnection, setCurrentBucket } = useContext(AuthContext);
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState(null);

  useEffect(() => {
    if (currentConnection) {
      fetchBuckets();
    } else {
      setBuckets([]);
      setSelectedBucket(null); // Reset the selection
    }
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
      Alert.alert(i18n.t('error'), i18n.t('chooseConnection'));
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
      Alert.alert(i18n.t('error'), i18n.t('error'));
    }
  };

  const renderBucketItem = ({ item }) => (
    <List.Item
      title={item.Name}
      onPress={() => handleBucketSelect(item)}
      left={(props) => <List.Icon {...props} icon="bucket" />}
      right={() => (
        selectedBucket === item.Name ? <List.Icon icon="check" /> : null
      )}
      style={selectedBucket === item.Name ? styles.selectedItem : null}
    />
  );

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!currentConnection) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>{i18n.t('chooseConnection')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{i18n.t('selectBucket')}</Text>
      <FlatList
        data={buckets}
        keyExtractor={(item) => item.Name}
        renderItem={renderBucketItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    marginTop: 24,
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
    backgroundColor: '#e0f7fa',
  },
});
