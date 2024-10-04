// src/theme/theme.js
import { MD3LightTheme as DefaultTheme } from 'react-native-paper';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#6200ee', // Color primario de la app
    accent: '#03dac4',  // Color secundario o de acento
  },
};

export default theme;
