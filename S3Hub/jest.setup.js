// Jest setup file. Runs after the test framework is installed in the environment.
// Adds custom matchers from @testing-library/react-native (toHaveTextContent, etc.).
// In RNTL v12.4+ the matchers are bundled and auto-extended by the preset, but
// importing the extend-expect entry is safe and explicit.
import '@testing-library/react-native/extend-expect';
