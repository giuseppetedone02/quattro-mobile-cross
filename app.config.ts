import type { ExpoConfig, ConfigContext } from 'expo/config';
import { withGradleProperties, type ConfigPlugin } from 'expo/config-plugins';

// Solo per le build CI su GitHub Actions (runner ubuntu-latest, 7GB di RAM
// totali). expo prebuild scrive gia' org.gradle.jvmargs di default (heap
// 2GB / metaspace 512MB) dentro android/gradle.properties: quel file di
// PROGETTO vince sempre su ~/.gradle/gradle.properties (il file utente), che
// quindi non basta a override -- va cambiato qui, cosi' finisce nel file
// giusto. Con expo-updates (KSP) e Reanimated (compila C++ per piu'
// architetture) i default di Gradle vanno in OutOfMemoryError sulla
// metaspace alla prima build senza cache. I valori sotto lasciano margine
// per il resto del sistema (npm, Metro) invece di riempire tutta la RAM
// disponibile, che causerebbe un OOM-kill del processo invece di un errore
// di heap gestibile.
const withCiGradleMemory: ConfigPlugin = (config) =>
  withGradleProperties(config, (config) => {
    const set = (key: string, value: string) => {
      config.modResults = config.modResults.filter(
        (item) => !(item.type === 'property' && item.key === key)
      );
      config.modResults.push({ type: 'property', key, value });
    };
    set('org.gradle.jvmargs', '-Xmx3072m -XX:MaxMetaspaceSize=768m -XX:+HeapDumpOnOutOfMemoryError');
    set('org.gradle.workers.max', '2');
    set('org.gradle.parallel', 'false');
    set('kotlin.daemon.jvmargs', '-Xmx1536m -XX:MaxMetaspaceSize=512m');
    return config;
  });

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

// Nome visualizzato all'utente (home screen, Expo Updates) -- SOLO UI.
// Il nome interno del progetto (slug, bundle id, package, scheme quattro://,
// chiavi di storage) resta 'quattro': cambiarlo comporterebbe reinstallazioni
// pulite per tutti (nuovo keystore/OAuth/deep link), cosa non richiesta qui.
const NAME = { development: 'BiteMark (dev)', preview: 'BiteMark (preview)', sideload: 'BiteMark' };
const ID = {
  development: 'com.giuseppetedone.quattro.dev',
  preview: 'com.giuseppetedone.quattro.preview',
  sideload: 'com.giuseppetedone.quattro',
};

export default ({ config }: ConfigContext): ExpoConfig =>
  withCiGradleMemory({
    ...config,
    name: NAME[VARIANT],
    // Icona generale (iOS + fallback): l'artwork ha uno sfondo bianco proprio,
    // quindi va qui cosi' com'e' -- niente sfondo scuro sovrapposto.
    icon: './assets/icon.png',
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
      // Sfondo bianco, non piu' il marrone scuro del vecchio Diamante: i
      // contorni del nuovo logo sono scuri e sparirebbero su un fondo scuro.
      adaptiveIcon: { foregroundImage: './assets/icon-foreground.png', backgroundColor: '#FFFFFF' },
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
        // imageWidth alzato da 260 a 320: a 260 il riquadro era piu' stretto
        // del logo (fetta + posate + scritta "QUATTRO"), che quindi risultava
        // tagliato ai margini. resizeMode 'contain' e' esplicito, cosi' il
        // logo intero resta sempre visibile scalato dentro il riquadro,
        // qualunque sia la larghezza dello schermo.
        //
        // Il problema successivo era diverso e non si risolveva con
        // imageWidth: su Android 12+ la Splash Screen API di sistema mostra
        // l'icona dentro un cerchio (la "safe zone" garantita da qualunque
        // maschera del launcher e' solo il ~66% del canvas dell'immagine).
        // Il PNG originale riempiva il 69-76% del canvas, quindi la scritta
        // "QUATTRO" e le punte della forchetta finivano tagliate dal cerchio
        // su quei launcher. La correzione vera e' nell'asset stesso
        // (assets/splash-icon.png e' stato rigenerato con l'artwork ridotto
        // al 52% del canvas, con margine trasparente attorno): imageWidth
        // qui e' salito a 380 per compensare, cosi' la dimensione VISIVA
        // sullo splash legacy (Android <12 e iOS) resta la stessa di prima.
        {
          image: './assets/splash-icon.png',
          backgroundColor: '#FFFFFF',
          imageWidth: 380,
          resizeMode: 'contain',
        },
      ],
    ],

    experiments: { typedRoutes: true, reactCompiler: true },

    extra: {
      variant: VARIANT,
      eas: { projectId: process.env.EAS_PROJECT_ID ?? '9e8c29e4-9be2-464a-875b-47cefbbd4cb6' },
    },
  });
