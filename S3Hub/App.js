// App.js

// Imoprt at startup to add polyfill for web streams globally
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
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </PaperProvider>
    </AuthProvider>
  );
}
