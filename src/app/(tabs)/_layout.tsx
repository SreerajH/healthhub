import { Tabs } from 'expo-router';

import { CoachTarget, FloatingTabBar } from '@/components/healthhub';

/** One custom floating tab bar on Android, iOS and web (the Figma NavBar). */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => (
        <CoachTarget id="tabs">
          <FloatingTabBar {...props} />
        </CoachTarget>
      )} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="records" options={{ title: 'Records' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
