import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/ui';
import { useInvitationBadgeCount } from '@/features/invitations';

function TabIcon({ name, focused, badge }: { name: IconName; focused: boolean; badge?: number }) {
  const theme = useTheme();
  return (
    <View>
      <Icon
        name={name}
        size={24}
        color={focused ? theme.colors.accentBase : theme.colors.textSecondary}
      />
      {badge && badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -5,
            right: -9,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: theme.radii.full,
            backgroundColor: theme.colors.accentBase,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="scoreSmall" color="inverse" style={{ fontSize: 11, lineHeight: 14 }}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Le icone dei quattro tab di default (list/map/users/user) sono neutre in
 * tutti i temi. "A tema" (pizzeria) e' l'eccezione: sceglie di sostituirle
 * con icone a tema pizza invece di limitarsi a ricolorarle, cosi' il tema
 * si vede anche nella tab bar e non solo negli accenti. Se un giorno
 * un altro tema volesse fare lo stesso, questa mappa e' il punto in cui
 * aggiungerlo: nessun altra schermata deve sapere che esiste.
 */
const PIZZA_TAB_ICONS: Record<'places' | 'map' | 'groups' | 'profile', IconName> = {
  places: 'pizzaSlice',
  map: 'pizzaPin',
  groups: 'pizzaBox',
  profile: 'chefHat',
};

export default function TabsLayout() {
  const theme = useTheme();
  const pendingInvites = useInvitationBadgeCount();
  const isPizza = theme.family === 'pizza';

  const iconFor = (tab: keyof typeof PIZZA_TAB_ICONS, fallback: IconName): IconName =>
    isPizza ? PIZZA_TAB_ICONS[tab] : fallback;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accentBase,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.bgSurface,
          borderTopColor: theme.colors.borderSubtle,
          height: 62,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: theme.fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="places"
        options={{
          title: 'Posti',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={iconFor('places', 'list')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Mappa',
          tabBarIcon: ({ focused }) => <TabIcon name={iconFor('map', 'map')} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Gruppi',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={iconFor('groups', 'users')} focused={focused} badge={pendingInvites} />
          ),
          tabBarAccessibilityLabel:
            pendingInvites > 0
              ? `Gruppi, ${pendingInvites} inviti da leggere`
              : 'Gruppi',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profilo',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={iconFor('profile', 'user')} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
