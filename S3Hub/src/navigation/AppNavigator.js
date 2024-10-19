// src/navigation/AppNavigator.js

import React, { useContext } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import LoginScreen from '../screens/LoginScreen';
import ConnectionSelectScreen from '../screens/ConnectionSelectScreen';
import BucketSelectScreen from '../screens/BucketSelectScreen';
import FileListScreen from '../screens/FileListScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { AuthContext } from '../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import i18n from '../locales/translations';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function ConnectionsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Connections" component={ConnectionSelectScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function BucketsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Buckets" component={BucketSelectScreen} />
    </Stack.Navigator>
  );
}

function FilesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Files" component={FileListScreen} />
    </Stack.Navigator>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const { currentConnection, currentBucket, language } = useContext(AuthContext);

  return (
    <Tab.Navigator
      initialRouteName="ConnectionsTab"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
      }}
    >
      <Tab.Screen
        name="ConnectionsTab"
        component={ConnectionsStack}
        options={{
          tabBarLabel: i18n.t('connections'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="server" color={color} size={size} />
          ),
        }}
      />
      {currentConnection && (
        <Tab.Screen
          name="BucketsTab"
          component={BucketsStack}
          options={{
            tabBarLabel: i18n.t('buckets'),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="bucket" color={color} size={size} />
            ),
          }}
        />
      )}
      {currentConnection && currentBucket && (
        <Tab.Screen
          name="FilesTab"
          component={FilesStack}
          options={{
            tabBarLabel: i18n.t('files'),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="folder-image" color={color} size={size} />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStack}
        options={{
          tabBarLabel: i18n.t('settings'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { currentConnection, language, isLoading } = useContext(AuthContext);

  if (isLoading) {
    // Render a loading screen while loading data
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  // Update the i18n locale before rendering the app
  i18n.locale = language;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {currentConnection ? (
        <Stack.Screen name="MainTabs" component={MainTabs} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex:1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
