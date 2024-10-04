// src/screens/BucketSelectScreen.js

import React, { useEffect, useState, useContext } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Text, List } from 'react-native-paper';
import { AuthContext } from '../context/AuthContext';
import { listBuckets } from '../services/s3Service';

export default function BucketSelectScreen({ navigation }) {
  const { currentConnection, setCurrentBucket } = useContext(AuthContext);
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState(null); // Nuevo estado

  useEffect(() => {
    if (currentConnection) {
      fetchBuckets();
    } else {
      setBuckets([]);
      setSelectedBucket(null); // Resetear la selección
    }
  }, [currentConnection]);

  const fetchBuckets = async () => {
    try {
      setLoading(true);
      const bucketsList = await listBuckets(currentConnection);
      setBuckets(bucketsList);

      // Si solo hay un bucket, seleccionarlo automáticamente
      if (bucketsList.length === 1) {
        const singleBucket = bucketsList[0];
        setSelectedBucket(singleBucket.Name); // Actualizar el estado de selección
        await setCurrentBucket(singleBucket.Name);
        navigation.navigate('FilesTab'); // Navegar a la pestaña de archivos
      }
    } catch (error) {
      console.error("Error al obtener los buckets:", error);
      Alert.alert("Error", "Error al obtener la lista de buckets.");
    } finally {
      setLoading(false);
    }
  };

  const handleBucketSelect = async (bucket) => {
    try {
      setSelectedBucket(bucket.Name); // Actualizar el estado de selección
      await setCurrentBucket(bucket.Name);
      navigation.navigate('FilesTab'); // Navegar a la pestaña de archivos
    } catch (error) {
      console.error("Error al seleccionar el bucket:", error);
      Alert.alert("Error", "No se pudo seleccionar el bucket.");
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
        <Text style={styles.message}>Por favor, selecciona una conexión primero.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Selecciona un Bucket</Text>
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
    marginTop: 40,
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
    backgroundColor: '#e0f7fa', // Color de fondo para el ítem seleccionado
  },
});
