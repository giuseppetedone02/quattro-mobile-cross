import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchField,
  Text,
} from '@/components/ui';
import { BUCKETS, publicUrl } from '@/lib/photos';
import { friendlyError } from '@/lib/errors';
import {
  PEOPLE_SEARCH_MIN_CHARS,
  canSearchPeople,
  useSearchPeople,
  type PersonResult,
} from '../hooks/useInvitations';

export type PeopleSearchProps = {
  onInvite: (identifier: string) => void;
  /** username o email dell'invito in corso: mostra il bottone come occupato. */
  invitingIdentifier?: string | null;
  /** Chi e' gia' dentro non si invita: al posto del bottone una chip spenta. */
  alreadyMemberIds?: string[];
};

/**
 * Ricerca di persone da invitare.
 *
 * Le due condizioni vuote sono diverse e non vanno confuse: "digita almeno 3
 * caratteri" e' una istruzione, "nessun risultato" e' un fatto. Sull'email il
 * messaggio ricorda che serve quella esatta, perche' la RPC non fa ricerca
 * parziale sulle email -- e' la misura che impedisce di enumerare gli iscritti.
 */
export function PeopleSearch({
  onInvite,
  invitingIdentifier,
  alreadyMemberIds = [],
}: PeopleSearchProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');

  const active = canSearchPeople(debounced);
  const { data, isPending, isError, error, refetch } = useSearchPeople(debounced);
  const members = new Set(alreadyMemberIds);

  return (
    <View style={{ gap: theme.spacing[4] }}>
      <SearchField
        value={text}
        onChangeText={setText}
        onDebouncedChange={setDebounced}
        placeholder="Username o email"
        loading={active && isPending}
        accessibilityLabel="Cerca una persona da invitare"
      />

      {!active ? (
        <EmptyState
          icon="search"
          title={`Digita almeno ${PEOPLE_SEARCH_MIN_CHARS} caratteri`}
          message="Cerca per username. Con l'email serve quella esatta: non si cerca per pezzi."
        />
      ) : isError ? (
        <ErrorState message={friendlyError(error).message} onRetry={() => void refetch()} />
      ) : isPending ? (
        <LoadingState label="Sto cercando..." />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="user"
          title="Nessun risultato"
          message="Controlla l'username. Se hai usato un'email, deve essere esattamente quella con cui la persona si e' registrata."
        />
      ) : (
        <View accessibilityRole="list" style={{ gap: theme.spacing[2] }}>
          {(data ?? []).map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              inviting={invitingIdentifier === person.username}
              alreadyMember={members.has(person.id)}
              onInvite={() => onInvite(person.username)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function PersonRow({
  person,
  inviting,
  alreadyMember,
  onInvite,
}: {
  person: PersonResult;
  inviting: boolean;
  alreadyMember: boolean;
  onInvite: () => void;
}) {
  const theme = useTheme();
  const name = person.display_name ?? person.username;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing[3],
        paddingVertical: theme.spacing[2],
      }}
    >
      <Avatar
        uri={publicUrl(BUCKETS.avatars, person.avatar_path)}
        name={name}
        seed={person.id}
        size={40}
      />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          @{person.username}
        </Text>
      </View>

      {alreadyMember ? (
        <Chip label="Gia' nel gruppo" icon="check" />
      ) : (
        <Button
          label="Invita"
          size="sm"
          onPress={onInvite}
          loading={inviting}
          disabled={inviting}
          accessibilityLabel={`Invita ${name}`}
        />
      )}
    </View>
  );
}
