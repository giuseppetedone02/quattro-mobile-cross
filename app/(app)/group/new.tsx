import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Screen, Header } from '@/components/layout';
import { GroupForm, useCreateGroup } from '@/features/groups';
import { useActiveGroup } from '@/lib/store';
import { friendlyError } from '@/lib/errors';

export default function NewGroup() {
  const router = useRouter();
  const create = useCreateGroup();
  const { setGroupId } = useActiveGroup();
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen scroll avoidKeyboard>
      <Header close title="Crea un gruppo" />
      <GroupForm
        submitting={create.isPending}
        submitLabel="Crea il gruppo"
        error={error}
        onSubmit={async (values) => {
          setError(null);
          try {
            const group = await create.mutateAsync(values);
            // Il gruppo appena creato diventa quello attivo: e' quasi sempre
            // cio' che si vuole fare subito dopo averlo creato.
            setGroupId(group.id);
            router.replace(`/group/${group.id}`);
          } catch (e) {
            setError(friendlyError(e, 'groups').message);
          }
        }}
      />
    </Screen>
  );
}
