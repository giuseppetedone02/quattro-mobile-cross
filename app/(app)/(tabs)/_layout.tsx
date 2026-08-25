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

export default function TabsLayout() {
  const theme = useTheme();
  const pendingInvites = useInvitationBadgeCount();

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
          tabBarIcon: ({ focused }) => <TabIcon name="list" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Mappa',
          tabBarIcon: ({ focused }) => <TabIcon name="map" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Gruppi',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="users" focused={focused} badge={pendingInvites} />
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
          tabBarIcon: ({ focused }) => <TabIcon name="user" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
