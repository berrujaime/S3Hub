// src/screens/HomeScreen.js
import React, { useContext, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, List } from 'react-native-paper';
import { AuthContext } from '../context/AuthContext';
import { listBuckets } from '../services/s3Service';

export default function HomeScreen({ navigation }) {
  const { currentConnection } = useContext(AuthContext);
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBuckets();
  }, []);

  const fetchBuckets = async () => {
    try {
      const bucketsList = await listBuckets(currentConnection);
      setBuckets(bucketsList);
    } catch (error) {
      console.error("Error al obtener los buckets:", error);
      Alert.alert("Error", "No se pudieron obtener los buckets.");
    } finally {
      setLoading(false);
    }
  };

  const handleBucketSelect = (bucketName) => {
    navigation.navigate('FileList', { bucketName });
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineLarge" style={styles.title}>Selecciona un Bucket</Text>
      <FlatList
        data={buckets}
        keyExtractor={(item) => item.Name}
        renderItem={({ item }) => (
          <List.Item
            title={item.Name}
            onPress={() => handleBucketSelect(item.Name)}
            left={(props) => <List.Icon {...props} icon="folder" />}
          />
        )}
        refreshing={loading}
        onRefresh={fetchBuckets}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    marginTop: 40,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
});
