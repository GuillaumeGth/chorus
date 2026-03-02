module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/.*|sentry-expo|native-base|react-native-svg)',
  ],
  moduleNameMapper: {
    // @expo/vector-icons is nested under expo — provide a lightweight mock for tests
    '@expo/vector-icons': '<rootDir>/__mocks__/@expo/vector-icons.js',
  },
};
