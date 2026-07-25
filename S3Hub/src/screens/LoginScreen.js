// src/screens/LoginScreen.js
import React, { useState, useContext } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { Text, TextInput, Button, Menu, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { validateCredentials } from '../services/authService';
import { PROVIDER_LIST, getProvider } from '../domain/providers';
import { mapS3Error } from '../domain/errors';
import { SCREEN_TOP_SPACING } from '../theme/spacing';
import i18n from '../locales/translations';

export default function LoginScreen({ navigation }) {
  const theme = useTheme();
  // This screen renders with headerShown: false (see AppNavigator.js) both
  // as the root screen (no connection yet) and inside ConnectionsStack, so
  // it is always the first thing under the status bar — insets.top replaces
  // the old hardcoded marginTop (Task 5.3).
  const insets = useSafeAreaInsets();

  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [service, setService] = useState('storj');
  const [region, setRegion] = useState(getProvider('storj').defaultRegion);
  const [accountId, setAccountId] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [providerMenuVisible, setProviderMenuVisible] = useState(false);
  const [regionMenuVisible, setRegionMenuVisible] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);

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
      // validateCredentials resolves true or throws — it never resolves
      // false — so there is no invalid-but-not-throwing case to branch on.
      await validateCredentials(connection);

      await addConnection(connection);
      await setActiveConnection(connection);

      // This screen is reachable two ways: as the sole screen of the
      // pre-login root stack (AppNavigator), or pushed onto ConnectionsStack
      // via "add connection" from inside the tabs. `canGoBack()` tells them
      // apart (false in the former — there is nothing to go back to; true in
      // the latter, since Connections is the screen below it on that stack).
      if (navigation.canGoBack()) {
        // Post-login: return to the Connections list, which now shows the
        // new (and, per addConnection, newly active) connection.
        navigation.goBack();
      }
      // Else: first login. addConnection/setActiveConnection above already
      // set currentConnection, so AppNavigator's conditional root mounts
      // MainTabs on its own — no manual navigation needed or possible here.
    } catch (error) {
      console.error('Error validating credentials:', error?.name || error?.code, error?.message);
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
   * Renders the region field — its LABEL INCLUDED — as a Menu picker when the
   * provider exposes a fixed region list, or nothing at all when it does not
   * (`regions: null` — r2/gcs/custom). Those providers have no meaningful
   * region choice; the connection silently keeps the registry's
   * `defaultRegion` (set on provider change), which the signer needs but
   * S3-compatible endpoints ignore.
   *
   * The label lives HERE rather than at the call site so that hiding the
   * field hides its caption with it: when it was rendered separately, custom/
   * r2/gcs showed a dangling "Select Region:" heading over empty space.
   * @returns {React.ReactElement|null} The region field, or null.
   */
  const renderRegionInput = () => {
    if (!provider.regions) {
      return null;
    }
    return (
      <>
        <Text style={[styles.label, { color: theme.colors.onBackground }]}>
          {i18n.t('selectRegion')}
        </Text>
        <Menu
          visible={regionMenuVisible}
          onDismiss={closeRegionMenu}
          anchor={
            <Button
              mode="outlined"
              onPress={openRegionMenu}
              // Purpose + current value: the visible label is only the raw
              // region code (e.g. "us1"), which alone tells a screen-reader
              // user nothing about what this button does.
              accessibilityLabel={`${i18n.t('selectRegion')} ${region}`}
              style={styles.menuButton}
            >
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
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme.colors.background,
              paddingTop: insets.top + SCREEN_TOP_SPACING,
            },
          ]}
        >
          <Text
            variant="headlineLarge"
            accessibilityRole="header"
            style={[styles.title, { color: theme.colors.onBackground }]}
          >
            S3Hub
          </Text>

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
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            style={styles.input}
          />
          <TextInput
            label={i18n.t('secretKey')}
            value={secretKey}
            onChangeText={setSecretKey}
            mode="outlined"
            secureTextEntry={!secretVisible}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            style={styles.input}
            right={
              <TextInput.Icon
                icon={secretVisible ? 'eye-off' : 'eye'}
                onPress={() => setSecretVisible((prev) => !prev)}
                accessibilityLabel={
                  secretVisible ? i18n.t('hideSecretKey') : i18n.t('showSecretKey')
                }
              />
            }
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
                // Purpose + current value, same rationale as the region
                // menu button.
                accessibilityLabel={`${i18n.t('selectProvider')} ${provider.name}`}
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

          {/* Label included — renderRegionInput returns null (caption and
              all) for providers without a region list. */}
          {renderRegionInput()}

          <Button mode="contained" onPress={handleLogin} style={styles.button}>
            {i18n.t('login')}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 16,
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
