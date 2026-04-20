import { Redirect } from 'expo-router';

// Redirect to the main Assistant screen
export default function Index() {
  return <Redirect href="/(tabs)/assistant" />;
}
