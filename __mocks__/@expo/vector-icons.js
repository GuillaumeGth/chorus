// Lightweight mock for @expo/vector-icons used in Jest test environment.
// Returns a plain string tag for every icon set so render tests work
// without the native font assets.
const React = require('react');
const { Text } = require('react-native');

function createIconSet(name) {
  return function MockIcon({ testID, ...props }) {
    return React.createElement(Text, { testID: testID ?? name, ...props });
  };
}

module.exports = {
  Ionicons:       createIconSet('Ionicons'),
  MaterialIcons:  createIconSet('MaterialIcons'),
  FontAwesome:    createIconSet('FontAwesome'),
  FontAwesome5:   createIconSet('FontAwesome5'),
  AntDesign:      createIconSet('AntDesign'),
  Entypo:         createIconSet('Entypo'),
  Feather:        createIconSet('Feather'),
};
