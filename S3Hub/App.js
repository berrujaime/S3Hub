// App.js

import 'react-native-get-random-values';
import { ReadableStream } from 'web-streams-polyfill/ponyfill';
global.ReadableStream = ReadableStream;

import * as React from 'react';
import { useContext, useEffect } from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { lightTheme, darkTheme } from './src/theme/theme';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import * as Notifications from 'expo-notifications';
import { SafeAreaView, StyleSheet, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';

function ThemedApp() {
  const { theme } = useContext(AuthContext);
  const systemScheme = useColorScheme();

  // Resolve the 'system' preference to a concrete scheme.
  const resolvedScheme = theme === 'system' ? (systemScheme || 'light') : theme;
  const isDark = resolvedScheme === 'dark';
  const selectedTheme = isDark ? darkTheme : lightTheme;

  return (
    <PaperProvider theme={selectedTheme}>
      <SafeAreaView style={[styles.container, { backgroundColor: selectedTheme.colors.background }]}>
        <StatusBar
          style={isDark ? 'light' : 'dark'}
          backgroundColor={selectedTheme.colors.background}
        />
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaView>
    </PaperProvider>
  );
}

export default function App() {
  useEffect(() => {
    // Request permissions for notifications
    (async () => {
      await Notifications.requestPermissionsAsync();
    })();
  }, []);

  return (
    <AuthProvider>
      <ThemedApp />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
