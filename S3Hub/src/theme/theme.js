// src/theme/theme.js
import { MD3LightTheme as DefaultTheme } from 'react-native-paper';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#6200ee', // Primary color
    accent: '#03dac4',  // Secondary color
  },
};

export default theme;
