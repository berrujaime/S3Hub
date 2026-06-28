// src/screens/LoginScreen.js
import React, { useState, useContext } from 'react';
import { View, StyleSheet, Alert, Image } from 'react-native';
import { Text, TextInput, Button, Menu, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { validateCredentials } from '../services/authService';
import { PROVIDER_LIST, getProvider } from '../domain/providers';
import { mapS3Error } from '../domain/errors';
import i18n from '../locales/translations';

export default function LoginScreen({ navigation }) {
  const theme = useTheme();

  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [service, setService] = useState('storj');
  const [region, setRegion] = useState(getProvider('storj').defaultRegion);
  const [accountId, setAccountId] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [providerMenuVisible, setProviderMenuVisible] = useState(false);
  const [regionMenuVisible, setRegionMenuVisible] = useState(false);

  const { addConnection, setActiveConnection } = useContext(AuthContext);

  const provider = getProvider(service);

  /**
   * Builds the connection object, including the extra fields only when present.
   * @returns {Object} The connection descriptor.
   */
  const buildConnection = () => ({
    id: Date.now().toString(),
    accessKey,
    secretKey,
    service: provider.id,
    region,
    ...(accountId ? { accountId } : {}),
    ...(endpoint ? { endpoint } : {}),
  });

  /**
   * Handles the login process.
   */
  const handleLogin = async () => {
    if (!accessKey || !secretKey) {
      Alert.alert(i18n.t('error'), i18n.t('errorInvalidCredentials'));
      return;
    }

    const connection = buildConnection();

    try {
      const isValid = await validateCredentials(connection);

      if (isValid) {
        await addConnection(connection);
        await setActiveConnection(connection);
        navigation.navigate('Connections');
      } else {
        Alert.alert(i18n.t('error'), i18n.t('errorInvalidCredentials'));
      }
    } catch (error) {
      console.error(error);
      Alert.alert(i18n.t('error'), i18n.t(mapS3Error(error)));
    }
  };

  /**
   * Handles the opening of the provider menu.
   */
  const openProviderMenu = () => setProviderMenuVisible(true);

  /**
   * Handles the closing of the provider menu.
   */
  const closeProviderMenu = () => setProviderMenuVisible(false);

  /**
   * Handles the opening of the region menu.
   */
  const openRegionMenu = () => setRegionMenuVisible(true);

  /**
   * Handles the closing of the region menu.
   */
  const closeRegionMenu = () => setRegionMenuVisible(false);

  /**
   * Handles the provider change: resets the region to the provider's default
   * and clears the extra fields.
   * @param {string} id - The selected provider id.
   */
  const handleProviderChange = (id) => {
    const next = getProvider(id);
    setService(next.id);
    setRegion(next.defaultRegion);
    setAccountId('');
    setEndpoint('');
    closeProviderMenu();
  };

  /**
   * Renders the brand mark (logo image or icon) for a provider.
   * @param {Object} item - The provider descriptor.
   * @returns {React.ReactElement} The brand mark element.
   */
  const renderProviderMark = (item) =>
    item.logo ? (
      <Image source={item.logo} style={styles.logo} resizeMode="contain" />
    ) : (
      <MaterialCommunityIcons
        name={item.icon}
        size={24}
        color={theme.colors.onSurface}
        style={styles.logo}
      />
    );

  /**
   * Renders the extra fields required by the selected provider.
   * @returns {React.ReactElement[]} The extra field inputs.
   */
  const renderExtraFields = () =>
    provider.fields.map((field) => {
      if (field === 'accountId') {
        return (
          <TextInput
            key={field}
            label={i18n.t('accountId')}
            value={accountId}
            onChangeText={setAccountId}
            mode="outlined"
            autoCapitalize="none"
            style={styles.input}
          />
        );
      }
      if (field === 'endpoint') {
        return (
          <TextInput
            key={field}
            label={i18n.t('endpoint')}
            value={endpoint}
            onChangeText={setEndpoint}
            mode="outlined"
            autoCapitalize="none"
            keyboardType="url"
            style={styles.input}
          />
        );
      }
      return null;
    });

  /**
   * Renders the region input: a Menu picker when the provider exposes a fixed
   * region list, or a free-text input when it does not.
   * @returns {React.ReactElement} The region input element.
   */
  const renderRegionInput = () => {
    if (provider.regions) {
      return (
        <Menu
          visible={regionMenuVisible}
          onDismiss={closeRegionMenu}
          anchor={
            <Button mode="outlined" onPress={openRegionMenu} style={styles.menuButton}>
              {region}
            </Button>
          }
        >
          {provider.regions.map((reg) => (
            <Menu.Item
              key={reg}
              onPress={() => {
                setRegion(reg);
                closeRegionMenu();
              }}
              title={reg}
            />
          ))}
        </Menu>
      );
    }

    return (
      <TextInput
        label={i18n.t('selectRegion')}
        value={region}
        onChangeText={setRegion}
        mode="outlined"
        autoCapitalize="none"
        style={styles.input}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text variant="headlineLarge" style={styles.title}>S3Hub</Text>

      <Image
        source={require('../../assets/logos/S3HubLogo_bg.png')}
        style={styles.centeredImage}
        resizeMode="contain"
      />

      <TextInput
        label={i18n.t('accessKey')}
        value={accessKey}
        onChangeText={setAccessKey}
        mode="outlined"
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        label={i18n.t('secretKey')}
        value={secretKey}
        onChangeText={setSecretKey}
        mode="outlined"
        secureTextEntry
        autoCapitalize="none"
        style={styles.input}
      />

      <Text style={[styles.label, { color: theme.colors.onBackground }]}>
        {i18n.t('selectProvider')}
      </Text>
      <Menu
        visible={providerMenuVisible}
        onDismiss={closeProviderMenu}
        anchor={
          <Button
            mode="outlined"
            onPress={openProviderMenu}
            icon={() => renderProviderMark(provider)}
            style={styles.menuButton}
          >
            {provider.name}
          </Button>
        }
      >
        {PROVIDER_LIST.map((item) => (
          <Menu.Item
            key={item.id}
            onPress={() => handleProviderChange(item.id)}
            title={item.name}
            leadingIcon={() => renderProviderMark(item)}
          />
        ))}
      </Menu>

      {renderExtraFields()}

      <Text style={[styles.label, { color: theme.colors.onBackground }]}>
        {i18n.t('selectRegion')}
      </Text>
      {renderRegionInput()}

      <Button mode="contained" onPress={handleLogin} style={styles.button}>
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
    marginBottom: 0,
  },
  centeredImage: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginBottom: 10,
  },
  input: {
    marginBottom: 16,
  },
  label: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 16,
  },
  logo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  menuButton: {
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  button: {
    marginTop: 24,
  },
});
