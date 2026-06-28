// src/context/AuthContext.js

import React, { createContext, useState, useEffect } from 'react';
import i18n from '../locales/translations';
import * as connectionRepository from '../data/connectionRepository';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [connections, setConnections] = useState([]);
  const [currentConnection, setCurrentConnection] = useState(null);
  const [currentBucket, setCurrentBucket] = useState(null);
  const [language, setLanguage] = useState(i18n.locale || 'en');
  const [isLoading, setIsLoading] = useState(true);
  const [preview, setPreview] = useState("true");
  const [theme, setTheme] = useState('system');

  const addConnection = async (connection) => {
    const newConnections = [...connections, connection];
    setConnections(newConnections);
    await connectionRepository.saveConnections(newConnections);
    await setActiveConnection(connection);
  };

  const setActiveConnection = async (connection) => {
    // Reset currentBucket before changing currentConnection
    setCurrentBucket(null);
    await connectionRepository.clearCurrentBucket();

    setCurrentConnection(connection);
    await connectionRepository.saveCurrentConnection(connection);
  };

  const setCurrentBucketFunction = async (bucketName) => {
    setCurrentBucket(bucketName);
    await connectionRepository.saveCurrentBucket(bucketName);
  };

  const deleteConnection = async (id) => {
    const updatedConnections = connections.filter(conn => conn.id !== id);

    setConnections(updatedConnections);

    await connectionRepository.saveConnections(updatedConnections);

    if (currentConnection && currentConnection.id === id) {
      if (updatedConnections.length > 0) {
        await setActiveConnection(updatedConnections[0]);
      } else {
        setCurrentConnection(null);
        await connectionRepository.clearCurrentConnection();
        setCurrentBucket(null);
        await connectionRepository.clearCurrentBucket();
      }
    }
  };

  const changeLanguage = async (newLanguage) => {
    setLanguage(newLanguage);
    i18n.locale = newLanguage;
    await connectionRepository.saveLanguage(newLanguage);
  };

  const changePreview = async (newPreview) => {
    setPreview(newPreview);
    await connectionRepository.savePreview(newPreview);
  };

  const changeTheme = async (newTheme) => {
    setTheme(newTheme);
    await connectionRepository.saveTheme(newTheme);
  };

  useEffect(() => {
    const loadStoredData = async () => {
      try {
        const storedConnections = await connectionRepository.getConnections();
        if (storedConnections && storedConnections.length > 0) {
          setConnections(storedConnections);
        }

        const storedCurrentConnection = await connectionRepository.getCurrentConnection();
        if (storedCurrentConnection) {
          setCurrentConnection(storedCurrentConnection);
        }

        const storedCurrentBucket = await connectionRepository.getCurrentBucket();
        if (storedCurrentBucket) {
          setCurrentBucket(storedCurrentBucket);
        }

        const storedLanguage = await connectionRepository.getLanguage();
        if (storedLanguage) {
          setLanguage(storedLanguage);
          i18n.locale = storedLanguage;
        } else {
          // Set default language
          setLanguage(i18n.locale || 'en');
          i18n.locale = i18n.locale || 'en';
          await connectionRepository.saveLanguage(i18n.locale || 'en');
        }

        const storedPreview = await connectionRepository.getPreview();
        if (storedPreview) {
          setPreview(storedPreview);
        }

        const storedTheme = await connectionRepository.getTheme();
        setTheme(storedTheme || 'system');
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
      theme,
      addConnection,
      setActiveConnection,
      setCurrentBucket: setCurrentBucketFunction,
      deleteConnection,
      changeLanguage,
      changePreview,
      changeTheme,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
