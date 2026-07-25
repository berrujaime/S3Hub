// src/screens/SettingsScreen.js
import React, { useContext } from 'react';
import { View, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import i18n from '../locales/translations';
import Constants from 'expo-constants';
import ScreenTitle from '../components/ScreenTitle';
import ThemedSelect from '../components/ThemedSelect';
import { SCREEN_TOP_SPACING } from '../theme/spacing';

export default function SettingsScreen() {
  const theme = useTheme();
  // headerShown: false (see AppNavigator.js's SettingsStack) — this screen
  // sits directly under the status bar, so insets.top replaces the old
  // hardcoded marginTop (Task 5.3).
  const insets = useSafeAreaInsets();

  const languages = [
    { label: 'English', value: 'en' },
    { label: 'Español', value: 'es' },
  ];

  const themes = [
    { label: i18n.t('themeSystem'), value: 'system' },
    { label: i18n.t('themeLight'), value: 'light' },
    { label: i18n.t('themeDark'), value: 'dark' },
  ];

  const { language, changeLanguage } = useContext(AuthContext);
  const { preview, changePreview } = useContext(AuthContext);
  const { theme: themePreference, changeTheme } = useContext(AuthContext);

  const privacyPolicyUrl = Constants.expoConfig?.extra?.privacyPolicyUrl;

  const handleLanguageChange = (value) => {
    changeLanguage(value);
  };

  const handlePreviewChange = (value) => {
    changePreview(value);
  };

  const handleThemeChange = (value) => {
    changeTheme(value);
  };

  const handlePrivacyPolicy = () => {
    if (privacyPolicyUrl) {
      Linking.openURL(privacyPolicyUrl);
    }
  };

  const previewOptions = [
    { label: i18n.t('optionYes'), value: 'true' },
    { label: i18n.t('optionNo'), value: 'false' },
  ];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, paddingTop: insets.top + SCREEN_TOP_SPACING },
      ]}
    >
      <ScreenTitle>{i18n.t('settings')}</ScreenTitle>

      <Text style={[styles.label, { color: theme.colors.onBackground }]}>
        {i18n.t('selectLanguage')}
      </Text>
      <ThemedSelect
        options={languages}
        value={language}
        onChange={handleLanguageChange}
        accessibilityLabel={i18n.t('selectLanguage')}
        testID="language-select"
      />

      <Text style={[styles.label, { color: theme.colors.onBackground }]}>
        {i18n.t('selectPreview')}
      </Text>
      <ThemedSelect
        options={previewOptions}
        value={preview}
        onChange={handlePreviewChange}
        accessibilityLabel={i18n.t('selectPreview')}
        testID="preview-select"
      />

      <Text style={[styles.label, { color: theme.colors.onBackground }]}>
        {i18n.t('selectTheme')}
      </Text>
      <ThemedSelect
        options={themes}
        value={themePreference}
        onChange={handleThemeChange}
        accessibilityLabel={i18n.t('selectTheme')}
        testID="theme-select"
      />

      {privacyPolicyUrl ? (
        <TouchableOpacity onPress={handlePrivacyPolicy} style={styles.privacyLink}>
          <Text style={[styles.privacyText, { color: theme.colors.primary }]}>
            {i18n.t('privacyPolicy')}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  label: {
    marginBottom: 8,
    fontSize: 18,
  },
  privacyLink: {
    marginTop: 24,
    alignItems: 'center',
    padding: 12,
  },
  privacyText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
