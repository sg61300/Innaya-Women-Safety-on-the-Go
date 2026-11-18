// Automatic manual mock for node_modules AsyncStorage: the library ships an
// in-memory Jest mock. Placed under a roots (src) __mocks__ dir so any test
// whose tree reaches AsyncStorage (the ThemeProvider) renders without the
// native module. Applied automatically to node_modules imports.
module.exports = require("@react-native-async-storage/async-storage/jest/async-storage-mock");
