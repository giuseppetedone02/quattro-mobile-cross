module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { reactCompiler: true }]],
    // react-native-worklets/plugin sostituisce il vecchio
    // react-native-reanimated/plugin da Reanimated 4. Deve restare ULTIMO.
    plugins: ['react-native-worklets/plugin'],
  };
};
