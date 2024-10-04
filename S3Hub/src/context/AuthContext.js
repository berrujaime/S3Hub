// src/context/AuthContext.js

import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [connections, setConnections] = useState([]);
  const [temporaryConnections, setTemporaryConnections] = useState([]);
  const [currentConnection, setCurrentConnection] = useState(null);
  const [currentBucket, setCurrentBucket] = useState(null);

  const addConnection = async (connection, remember) => {
    if (remember) {
      const newConnections = [...connections, connection];
      setConnections(newConnections);
      await SecureStore.setItemAsync('connections', JSON.stringify(newConnections));
    } else {
      setTemporaryConnections(prev => [...prev, connection]);
    }
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
    const updatedTemporaryConnections = temporaryConnections.filter(conn => conn.id !== id);

    setConnections(updatedConnections);
    setTemporaryConnections(updatedTemporaryConnections);

    await SecureStore.setItemAsync('connections', JSON.stringify(updatedConnections));

    if (currentConnection && currentConnection.id === id) {
      const allConnections = [...updatedConnections, ...updatedTemporaryConnections];
      if (allConnections.length > 0) {
        await setActiveConnection(allConnections[0]);
      } else {
        setCurrentConnection(null);
        await SecureStore.deleteItemAsync('currentConnection');
        setCurrentBucket(null);
        await SecureStore.deleteItemAsync('currentBucket');
      }
    }
  };

  const getAllConnections = () => {
    return [...connections, ...temporaryConnections];
  };

  useEffect(() => {
    const loadStoredData = async () => {
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

      // No cargamos conexiones temporales, asegurando que se eliminen al reiniciar la app
      setTemporaryConnections([]);
    };

    loadStoredData();
  }, []);

  return (
    <AuthContext.Provider value={{
      connections: getAllConnections(),
      currentConnection,
      currentBucket,
      addConnection,
      setActiveConnection,
      setCurrentBucket: setCurrentBucketFunction,
      deleteConnection,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
