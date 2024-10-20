// App.js

// Import at startup to add polyfill for web streams globally
import 'react-native-get-random-values';
import { ReadableStream } from 'web-streams-polyfill/ponyfill';
global.ReadableStream = ReadableStream;

import * as React from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import theme from './src/theme/theme';
import { AuthProvider } from './src/context/AuthContext';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  useEffect(() => {
    // Request permissions for notifications
    (async () => {
      await Notifications.requestPermissionsAsync();
    })();
  }, []);

  return (
    <AuthProvider>
      <PaperProvider theme={theme}>
        <SafeAreaView style={styles.container}>
          <StatusBar style="dark" backgroundColor="#ffffff" />
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </SafeAreaView>
      </PaperProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
