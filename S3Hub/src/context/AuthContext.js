// src/context/AuthContext.js

import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import i18n from '../locales/translations';
import * as connectionRepository from '../data/connectionRepository';
import { reconcileCurrentConnection } from '../domain/cacheKeys';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [connections, setConnections] = useState([]);
  const [currentConnection, setCurrentConnection] = useState(null);
  const [currentBucket, setCurrentBucket] = useState(null);
  const [language, setLanguage] = useState(i18n.locale || 'en');
  const [isLoading, setIsLoading] = useState(true);
  const [preview, setPreview] = useState("true");
  const [theme, setTheme] = useState('system');

  const setActiveConnection = useCallback(async (connection) => {
    // Reset currentBucket before changing currentConnection
    setCurrentBucket(null);
    await connectionRepository.clearCurrentBucket();

    setCurrentConnection(connection);
    await connectionRepository.saveCurrentConnection(connection);
  }, []);

  const setCurrentBucketFunction = useCallback(async (bucketName) => {
    setCurrentBucket(bucketName);
    await connectionRepository.saveCurrentBucket(bucketName);
  }, []);

  const changeLanguage = useCallback(async (newLanguage) => {
    setLanguage(newLanguage);
    i18n.locale = newLanguage;
    await connectionRepository.saveLanguage(newLanguage);
  }, []);

  const changePreview = useCallback(async (newPreview) => {
    setPreview(newPreview);
    await connectionRepository.savePreview(newPreview);
  }, []);

  const changeTheme = useCallback(async (newTheme) => {
    setTheme(newTheme);
    await connectionRepository.saveTheme(newTheme);
  }, []);

  const addConnection = useCallback(async (connection) => {
    const newConnections = [...connections, connection];
    setConnections(newConnections);
    await connectionRepository.saveConnections(newConnections);
    await setActiveConnection(connection);
  }, [connections, setActiveConnection]);

  const deleteConnection = useCallback(async (id) => {
    const updatedConnections = connections.filter(conn => conn.id !== id);

    setConnections(updatedConnections);

    await connectionRepository.deleteConnection(id);

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
  }, [connections, currentConnection, setActiveConnection]);

  // Logs the user out of the currently active connection: clears
  // currentConnection/currentBucket (in memory and persisted), so a restart
  // lands back on Login instead of auto-signing back in. Deliberately does
  // NOT touch `connections` or their storage — logging out never deletes any
  // saved connection, it only deactivates the current one.
  const logout = useCallback(async () => {
    setCurrentConnection(null);
    await connectionRepository.clearCurrentConnection();
    setCurrentBucket(null);
    await connectionRepository.clearCurrentBucket();
  }, []);

  useEffect(() => {
    const loadStoredData = async () => {
      try {
        // getConnections() already backfills a stable id for legacy
        // connections stored without one (see connectionRepository /
        // domain/cacheKeys.deriveConnectionId), so `connections` below is
        // always populated with unique, non-empty ids.
        const storedConnections = await connectionRepository.getConnections();
        if (storedConnections && storedConnections.length > 0) {
          setConnections(storedConnections);
        }

        const storedCurrentConnection = await connectionRepository.getCurrentConnection();
        if (storedCurrentConnection) {
          // connectionRepository.getCurrentConnection() already resolves the
          // stored current-connection id against the (migrated, id-backfilled)
          // connections list, so storedCurrentConnection is either null or one
          // of storedConnections' entries. Reconciling it again here is a
          // defensive no-op in the common case; it just guarantees the
          // `currentConnection` state holds the exact same object reference
          // as its `connections` counterpart. See
          // domain/cacheKeys.reconcileCurrentConnection for the full rules.
          setCurrentConnection(
            reconcileCurrentConnection(storedCurrentConnection, storedConnections)
          );
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
        console.error("Error loading stored data:", error);
      } finally {
        setIsLoading(false); // Finish loading
      }
    };

    loadStoredData();
  }, []);

  const value = useMemo(() => ({
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
    logout,
    changeLanguage,
    changePreview,
    changeTheme,
  }), [
    connections,
    currentConnection,
    currentBucket,
    language,
    isLoading,
    preview,
    theme,
    addConnection,
    setActiveConnection,
    setCurrentBucketFunction,
    deleteConnection,
    logout,
    changeLanguage,
    changePreview,
    changeTheme,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
