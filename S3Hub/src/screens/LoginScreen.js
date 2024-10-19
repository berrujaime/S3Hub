// src/screens/LoginScreen.js
import React, { useState, useContext } from 'react';
import { View, StyleSheet, Alert, Image } from 'react-native';
import { Text, TextInput, Button, RadioButton, Menu } from 'react-native-paper';
import { AuthContext } from '../context/AuthContext';
import { validateCredentials } from '../services/authService';
import i18n from '../locales/translations';

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
          Alert.alert(i18n.t('error'), i18n.t('error'));
        }
      } catch (error) {
        console.error(error);
        Alert.alert(i18n.t('error'), i18n.t('error'));
      }
    } else {
      Alert.alert(i18n.t('error'), i18n.t('error'));
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
    setRegion(regionsByService[value][0]);
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineLarge" style={styles.title}>S3Hub</Text>
      
      <TextInput
        label={i18n.t('accessKey')}
        value={accessKey}
        onChangeText={setAccessKey}
        mode="outlined"
        style={styles.input}
      />
      <TextInput
        label={i18n.t('secretKey')}
        value={secretKey}
        onChangeText={setSecretKey}
        mode="outlined"
        secureTextEntry
        style={styles.input}
      />

      <Text style={styles.label}>{i18n.t('selectService')}</Text>
      <RadioButton.Group onValueChange={handleServiceChange} value={service}>
        <View style={styles.radioButtonContainer}>
          <RadioButton value="storj" />
          <Image source={require('../../assets/logos/storj.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.radioText}>Storj</Text>
        </View>
        <View style={styles.radioButtonContainer}>
          <RadioButton value="aws" />
          <Image source={require('../../assets/logos/aws.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.radioText}>AWS S3</Text>
        </View>
      </RadioButton.Group>

      <Text style={styles.label}>{i18n.t('selectRegion')}</Text>
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
        {i18n.t('login')}
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
  logo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  radioText: {
    fontSize: 16,
  },
  menuButton: {
    marginBottom: 16,
  },
  button: {
    marginTop: 24,
  },
});
