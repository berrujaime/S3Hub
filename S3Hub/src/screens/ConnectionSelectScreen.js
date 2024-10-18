// src/screens/ConnectionSelectScreen.js

import React, { useContext } from 'react';
import { View, StyleSheet, FlatList, Alert, Image } from 'react-native';
import { Text, List, FAB, IconButton } from 'react-native-paper';
import { AuthContext } from '../context/AuthContext';

export default function ConnectionSelectScreen({ navigation }) {
  const { connections, currentConnection, setActiveConnection, deleteConnection } = useContext(AuthContext);

  const handleConnectionSelect = async (connection) => {
    await setActiveConnection(connection);
    navigation.navigate('BucketsTab');
  };

  const handleAddConnection = () => {
    navigation.navigate('Login');
  };

  const handleDeleteConnection = (connection) => {
    Alert.alert(
      'Eliminar conexión',
      `¿Estás seguro de que deseas eliminar la conexión ${connection.service}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
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
    const logoSource =
      item.service === 'storj'
        ? require('../../assets/logos/storj.png')
        : require('../../assets/logos/aws.png');

    return (
      <List.Item
        title={item.service}
        description={`Access Key: ${item.accessKey}`}
        onPress={() => handleConnectionSelect(item)}
        left={() => <Image source={logoSource} style={styles.logo} resizeMode="contain" />}
        right={(props) => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {isActive ? <List.Icon {...props} icon="check" color={props.color} /> : null}
            <IconButton
              icon="delete"
              onPress={() => handleDeleteConnection(item)}
            />
          </View>
        )}
      />
    );
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineLarge" style={styles.title}>Selecciona una Conexión</Text>
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
    marginTop: 40,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  logo: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 64,
  },
});
