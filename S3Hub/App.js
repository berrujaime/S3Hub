// App.js

import 'react-native-get-random-values';
import { ReadableStream } from 'web-streams-polyfill/ponyfill';
global.ReadableStream = ReadableStream;

/* eslint-disable import/first -- polyfills above must run before any other import */
import * as React from 'react';
import { useContext, useEffect } from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';
import AppNavigator from './src/navigation/AppNavigator';
import { lightTheme, darkTheme } from './src/theme/theme';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import * as Notifications from 'expo-notifications';
import { ActivityIndicator, SafeAreaView, StyleSheet, View, useColorScheme } from 'react-native';
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
  // Font family names here are the exact keys src/theme/theme.js expects
  // (see the comment above `fontConfig` in that file) — both derive from
  // the same @expo-google-fonts/* export names, so a typo here would
  // surface as a ReferenceError rather than a silent font mismatch.
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    // Request permissions for notifications
    (async () => {
      await Notifications.requestPermissionsAsync();
    })();
  }, []);

  if (!fontsLoaded && !fontError) {
    // Reuse the same lightweight loading indicator AppNavigator renders
    // while AuthContext is hydrating (see src/navigation/AppNavigator.js),
    // so both "not ready yet" states look identical to the user. This is
    // rendered above PaperProvider/AuthProvider since the theme's fonts
    // config assumes the custom families are already registered. If
    // loading fails (fontError set), fall through to the app rather than
    // block forever — Paper/RN fall back to a system font.
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
