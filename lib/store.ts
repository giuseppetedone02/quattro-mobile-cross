import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PaletteFamily } from '@/theme/tokens';
import type { ThemePreference } from '@/theme/ThemeProvider';

/**
 * SOLO stato di UI, persistito. I dati del server stanno in TanStack Query.
 *
 * L'errore piu' comune e' mettere i dati del server qui: si finisce a
 * sincronizzare a mano due sorgenti di verita'. Questo store contiene tre
 * cose e basta: il tema, la modalita, e quale gruppo si sta guardando.
 */
export type AppearanceState = {
  family: PaletteFamily;
  preference: ThemePreference;
  setFamily: (f: PaletteFamily) => void;
  setPreference: (p: ThemePreference) => void;
};

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      family: 'sunset',
      preference: 'system',
      setFamily: (family) => set({ family }),
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: 'quattro-appearance',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export type ActiveGroupState = {
  /** null = non ancora scelto: la UI seleziona il gruppo personale. */
  groupId: string | null;
  setGroupId: (id: string | null) => void;
};

export const useActiveGroup = create<ActiveGroupState>()(
  persist(
    (set) => ({
      groupId: null,
      setGroupId: (groupId) => set({ groupId }),
    }),
    {
      name: 'quattro-active-group',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export type ViewMode = 'list' | 'grid';

export type PreferencesState = {
  placesViewMode: ViewMode;
  setPlacesViewMode: (m: ViewMode) => void;
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      placesViewMode: 'list',
      setPlacesViewMode: (placesViewMode) => set({ placesViewMode }),
    }),
    { name: 'quattro-preferences', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
