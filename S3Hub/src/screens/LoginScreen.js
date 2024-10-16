// src/screens/LoginScreen.js
import React, { useState, useContext } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, TextInput, Button, RadioButton, Menu, Checkbox } from 'react-native-paper';
import { AuthContext } from '../context/AuthContext';
import { validateCredentials } from '../services/authService';

export default function LoginScreen({ navigation }) {
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [service, setService] = useState('storj');
  const [region, setRegion] = useState('eu1');
  const [regionMenuVisible, setRegionMenuVisible] = useState(false);

  const { addConnection, setActiveConnection } = useContext(AuthContext);

  // Region list depending on the service
  const regionsByService = {
    storj: ['us1', 'eu1', 'ap1'],
    aws: ['us-east-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1'],
  };

  /**
   * Handles the login process.
   */
  const handleLogin = async () => {
    if (accessKey && secretKey) {
      try {
        const isValid = await validateCredentials({
          accessKey,
          secretKey,
          service,
          region,
        });

        if (isValid) {
          const newConnection = {
            id: Date.now().toString(),
            accessKey,
            secretKey,
            service,
            region,
          };
          await addConnection(newConnection);
          await setActiveConnection(newConnection);
          navigation.navigate('Connections');
        } else {
          Alert.alert('Error', 'Credenciales inválidas o acceso denegado.');
        }
      } catch (error) {
        console.error(error);
        Alert.alert('Error', 'No se pudo validar las credenciales.');
      }
    } else {
      Alert.alert('Error', 'Por favor, completa todos los campos.');
    }
  };

  /**
   * Handles the opening of the region menu.
   */
  const openRegionMenu = () => setRegionMenuVisible(true);

  /**
   * Handles the closing of the region menu.
   */
  const closeRegionMenu = () => setRegionMenuVisible(false);

  /**
   * Handles the service change and updates the default region.
   * @param {string} value - Service selected.
   */
  const handleServiceChange = (value) => {
    setService(value);
    setRegion(regionsByService[value][0]); // Set the first region as default
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineLarge" style={styles.title}>S3Hub</Text>
      
      <TextInput
        label="Access Key"
        value={accessKey}
        onChangeText={setAccessKey}
        mode="outlined"
        style={styles.input}
      />
      <TextInput
        label="Secret Key"
        value={secretKey}
        onChangeText={setSecretKey}
        mode="outlined"
        secureTextEntry
        style={styles.input}
      />

      <Text style={styles.label}>Selecciona el servicio:</Text>
      <RadioButton.Group onValueChange={handleServiceChange} value={service}>
        <View style={styles.radioButtonContainer}>
          <RadioButton value="storj" />
          <Text>Storj</Text>
        </View>
        <View style={styles.radioButtonContainer}>
          <RadioButton value="aws" />
          <Text>AWS S3</Text>
        </View>
      </RadioButton.Group>

      <Text style={styles.label}>Selecciona la región:</Text>
      <Menu
        visible={regionMenuVisible}
        onDismiss={closeRegionMenu}
        anchor={
          <Button mode="outlined" onPress={openRegionMenu} style={styles.menuButton}>
            {region}
          </Button>
        }
      >
        {regionsByService[service].map((reg) => (
          <Menu.Item key={reg} onPress={() => { setRegion(reg); closeRegionMenu(); }} title={reg} />
        ))}
      </Menu>

      <Button
        mode="contained"
        onPress={handleLogin}
        style={styles.button}
      >
        Login
      </Button>
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
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    marginBottom: 16,
  },
  label: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 16,
  },
  radioButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  menuButton: {
    marginBottom: 16,
  },
  button: {
    marginTop: 24,
  },
});
