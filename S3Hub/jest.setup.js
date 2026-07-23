// Jest setup file. Runs after the test framework is installed in the environment.
// Adds custom matchers from @testing-library/react-native (toHaveTextContent, etc.).
// In RNTL v12.4+ the matchers are bundled and auto-extended by the preset, but
// importing the extend-expect entry is safe and explicit.
import '@testing-library/react-native/extend-expect';

// Screens call useSafeAreaInsets() directly (Task 5.3) instead of a
// hardcoded top marginTop. In the real app this is always safe because
// react-navigation's Stack/Tab views wrap their screens in a
// SafeAreaProviderCompat internally (see @react-navigation/elements), but
// screen tests render the screen component standalone with no navigator or
// SafeAreaProvider ancestor, and the real hook throws in that case. The
// library ships this exact mock for that scenario: it resolves to zero
// insets absent a provider instead of throwing.
jest.mock('react-native-safe-area-context', () => {
  // The mock file is TS/TSX with a single `export default {...}`; unwrap it
  // here so the mocked require(...) result has the same shape as the real
  // module's named exports (`{ useSafeAreaInsets, SafeAreaProvider, ... }`)
  // instead of `{ default: {...} }` — react-native-paper and
  // react-navigation both destructure named exports from this module, and a
  // `default`-wrapped wanted shape would leave those undefined.
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});
