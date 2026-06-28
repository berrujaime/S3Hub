// src/theme/theme.js
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// Shared brand colors applied on top of both Paper base themes.
const brandColors = {
  primary: '#6200ee', // Primary color
  accent: '#03dac4',  // Secondary color
};

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...brandColors,
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...brandColors,
  },
};

// Default export kept equal to the light theme for safety / backward compatibility.
export default lightTheme;
