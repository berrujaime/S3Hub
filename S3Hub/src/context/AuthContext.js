// src/context/AuthContext.js

import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import i18n from '../locales/translations';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [connections, setConnections] = useState([]);
  const [currentConnection, setCurrentConnection] = useState(null);
  const [currentBucket, setCurrentBucket] = useState(null);
  const [language, setLanguage] = useState(i18n.locale || 'en');
  const [isLoading, setIsLoading] = useState(true);
  const [preview, setPreview] = useState("false");

  const addConnection = async (connection) => {
    const newConnections = [...connections, connection];
    setConnections(newConnections);
    await SecureStore.setItemAsync('connections', JSON.stringify(newConnections));
    await setActiveConnection(connection);
  };

  const setActiveConnection = async (connection) => {
    // Reset currentBucket before changing currentConnection
    setCurrentBucket(null);
    await SecureStore.deleteItemAsync('currentBucket');

    setCurrentConnection(connection);
    await SecureStore.setItemAsync('currentConnection', JSON.stringify(connection));
  };

  const setCurrentBucketFunction = async (bucketName) => {
    setCurrentBucket(bucketName);
    await SecureStore.setItemAsync('currentBucket', bucketName);
  };

  const deleteConnection = async (id) => {
    const updatedConnections = connections.filter(conn => conn.id !== id);

    setConnections(updatedConnections);

    await SecureStore.setItemAsync('connections', JSON.stringify(updatedConnections));

    if (currentConnection && currentConnection.id === id) {
      if (updatedConnections.length > 0) {
        await setActiveConnection(updatedConnections[0]);
      } else {
        setCurrentConnection(null);
        await SecureStore.deleteItemAsync('currentConnection');
        setCurrentBucket(null);
        await SecureStore.deleteItemAsync('currentBucket');
      }
    }
  };

  const changeLanguage = async (newLanguage) => {
    setLanguage(newLanguage);
    i18n.locale = newLanguage;
    await SecureStore.setItemAsync('appLanguage', newLanguage);
  };

  const changePreview = async (newPreview) => {
    setPreview(newPreview);
    await SecureStore.setItemAsync('preview', newPreview);
    console.log('preview', newPreview);
  };

  useEffect(() => {
    const loadStoredData = async () => {
      try {
        const storedConnections = await SecureStore.getItemAsync('connections');
        if (storedConnections) {
          setConnections(JSON.parse(storedConnections));
        }

        const storedCurrentConnection = await SecureStore.getItemAsync('currentConnection');
        if (storedCurrentConnection) {
          setCurrentConnection(JSON.parse(storedCurrentConnection));
        }

        const storedCurrentBucket = await SecureStore.getItemAsync('currentBucket');
        if (storedCurrentBucket) {
          setCurrentBucket(storedCurrentBucket);
        }

        const storedLanguage = await SecureStore.getItemAsync('appLanguage');
        if (storedLanguage) {
          setLanguage(storedLanguage);
          i18n.locale = storedLanguage;
        } else {
          // Set default language
          setLanguage(i18n.locale || 'en');
          i18n.locale = i18n.locale || 'en';
          await SecureStore.setItemAsync('appLanguage', i18n.locale || 'en');
        }

        const storedPreview = await SecureStore.getItemAsync('preview');
        if (storedPreview) {
          setPreview(storedPreview);
        }
      } catch (error) {
        console.error("Error cargando datos almacenados:", error);
      } finally {
        setIsLoading(false); // Finalizar la carga
      }
    };

    loadStoredData();
  }, []);

  return (
    <AuthContext.Provider value={{
      connections,
      currentConnection,
      currentBucket,
      language,
      isLoading,
      preview,
      addConnection,
      setActiveConnection,
      setCurrentBucket: setCurrentBucketFunction,
      deleteConnection,
      changeLanguage,
      changePreview,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
