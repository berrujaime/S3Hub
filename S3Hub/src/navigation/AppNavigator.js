// src/navigation/AppNavigator.js

import React, { useContext } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import LoginScreen from '../screens/LoginScreen';
import ConnectionSelectScreen from '../screens/ConnectionSelectScreen';
import BucketSelectScreen from '../screens/BucketSelectScreen';
import FileListScreen from '../screens/FileListScreen';
import { AuthContext } from '../context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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

function MainTabs() {
  const { currentConnection, currentBucket } = useContext(AuthContext);

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
          tabBarLabel: 'Conexiones',
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
            tabBarLabel: 'Buckets',
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
            tabBarLabel: 'Archivos',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="folder-image" color={color} size={size} />
            ),
          }}
        />
      )}
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { currentConnection } = useContext(AuthContext);

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
