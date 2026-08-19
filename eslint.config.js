const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  { ignores: ['node_modules/**', 'android/**', 'ios/**', '.expo/**', 'supabase/functions/**'] },
  {
    rules: {
      // I colori letterali sono vietati: tutto passa dai token del tema.
      // Questa e' la regola che impedisce il difetto di WantABook, dove le
      // palette esistevano in due posti disallineati.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^#(?:[0-9a-fA-F]{3,4}){1,2}$/]",
          message:
            'Colore letterale vietato. Usa un token del tema: useTheme().colors.*',
        },
      ],
    },
  },
  {
    // Le palette SONO il posto dove i colori letterali vivono.
    files: [
      'theme/palettes/**',
      'theme/tokens.ts',
      // L'ombra e' sempre nera e esiste solo in tema chiaro: e' una costante
      // di design, non un colore di tema.
      'theme/shadows.ts',
      'app.config.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
