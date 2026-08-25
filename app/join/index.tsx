import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import { Button, TextField } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Inserimento manuale del codice di invito, per chi lo ha ricevuto come
 * testo (dettato, messaggiato senza link cliccabile, ecc.) invece che come
 * link quattro://join/<code>. Delega alla stessa schermata del deep link:
 * un solo punto che sa cosa fare con un codice.
 */
export default function JoinManually() {
  const theme = useTheme();
  const router = useRouter();
  const [code, setCode] = useState('');

  return (
    <Screen scroll avoidKeyboard>
      <Header close title="Ho un codice" subtitle="Inserisci il codice di invito" />

      <View style={{ gap: theme.spacing[4] }}>
        <TextField
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          placeholder="Es. 7K4QXB2P"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          hint="Chi ti ha invitato lo trova nella schermata Invita del suo gruppo."
        />

        <Button
          label="Continua"
          full
          disabled={code.trim().length === 0}
          onPress={() => router.push(`/join/${code.trim()}`)}
        />
      </View>
    </Screen>
  );
}
