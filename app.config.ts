import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Tre varianti di build:
 *  - development  dev client, per lavorare
 *  - preview      APK/IPA interni per i tester
 *  - sideload     come preview, ma SENZA alcuna capability che un Personal Team
 *                 Apple non possa concedere (vedi §22.5 del piano): un
 *                 entitlement non concedibile fa fallire la firma sulla
 *                 macchina dell'utente con un errore incomprensibile.
 */
type Variant = 'development' | 'preview' | 'sideload';
const VARIANT = (process.env.APP_VARIANT ?? 'development') as Variant;

const NAME = { development: 'Quattro (dev)', preview: 'Quattro (preview)', sideload: 'Quattro' };
const ID = {
  development: 'com.giuseppetedone.quattro.dev',
  preview: 'com.giuseppetedone.quattro.preview',
  sideload: 'com.giuseppetedone.quattro',
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: NAME[VARIANT],
  slug: 'quattro',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'quattro',
  userInterfaceStyle: 'automatic',
  // newArchEnabled non esiste piu' da SDK 55: la New Architecture e' sempre
  // attiva e non e' disattivabile. Il typechecker lo conferma.
  assetBundlePatterns: ['**/*'],

  // La policy fingerprint calcola l'impronta di tutto cio che influenza il
  // runtime nativo. Obbligatoria, non consigliata: con il sideload, servire un
  // aggiornamento OTA incompatibile costringerebbe ogni utente a rifirmare.
  runtimeVersion: { policy: 'fingerprint' },
  updates: { fallbackToCacheTimeout: 0 },

  ios: {
    bundleIdentifier: ID[VARIANT],
    supportsTablet: false,
    // NIENTE associatedDomains: richiede un entitlement che un Personal Team
    // non ha. Deep link solo via scheme quattro://
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'Serve per centrare la mappa su dove sei quando cerchi un posto.',
      NSPhotoLibraryUsageDescription:
        'Serve per allegare foto alle tue recensioni e impostare la foto profilo.',
      NSCameraUsageDescription: 'Serve per scattare una foto da allegare a una recensione.',
    },
  },

  android: {
    package: ID[VARIANT],
    // edgeToEdgeEnabled e' stato rimosso dallo schema in SDK 55:
    // edge-to-edge e' sempre attivo su Android e la chiave non esiste piu'.
    adaptiveIcon: { foregroundImage: './assets/icon-foreground.png', backgroundColor: '#1A1210' },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    [
      'react-native-maps',
      {
        // Le chiavi vanno SOLO qui. Metterle anche in ios.config.googleMapsApiKey
        // o android.config.googleMaps.apiKey provoca un conflitto: su Android
        // entrambi i plugin scrivono E rimuovono lo stesso meta-data, e uno dei
        // due lo cancella in base all'ordine dei mod.
        iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY,
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY,
      },
    ],
    [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME ?? 'com.googleusercontent.apps.placeholder' },
    ],
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '16.4',
          // MAI 'dynamic': incompatibile con l'SDK Google Maps iOS, che e'
          // linkato staticamente (issue react-native-maps#5646, chiusa come
          // "not planned"). Produce: "transitive dependencies that include
          // statically linked binaries".
          useFrameworks: 'static',
        },
        android: { minSdkVersion: 24, compileSdkVersion: 36, targetSdkVersion: 36 },
      },
    ],
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', backgroundColor: '#1A1210', imageWidth: 180 },
    ],
  ],

  experiments: { typedRoutes: true, reactCompiler: true },

  extra: {
    variant: VARIANT,
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '9e8c29e4-9be2-464a-875b-47cefbbd4cb6' },
  },
});
