import { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getToken } from "./src/lib/api";
import { getAuthStatus, type AuthStatus } from "./src/lib/banks-api";
import type { RootStackParamList } from "./src/navigation/types";
import { colors } from "./src/theme";
import { PinScreen } from "./src/screens/PinScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { BankScreen } from "./src/screens/BankScreen";
import { SendScreen } from "./src/screens/SendScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { PeopleScreen } from "./src/screens/PeopleScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

export default function App() {
  const [boot, setBoot] = useState(true);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await getAuthStatus();
        setStatus(s);
        const token = await getToken();
        if (token && !s.setupRequired && !s.locked) {
          setUnlocked(true);
        }
      } catch {
        setStatus({ setupRequired: true, locked: false });
      } finally {
        setBoot(false);
      }
    })();
  }, []);

  if (boot || !status) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          initialRouteName={unlocked ? "Home" : "Pin"}
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700", fontSize: 17 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="Pin" options={{ headerShown: false }}>
            {({ navigation }) => (
              <PinScreen
                status={status}
                onUnlocked={() => {
                  setUnlocked(true);
                  setStatus({ ...status, setupRequired: false, locked: false });
                  navigation.replace("Home");
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Bank" component={BankScreen} options={{ title: "Bank" }} />
          <Stack.Screen name="Send" component={SendScreen} options={{ title: "Pay" }} />
          <Stack.Screen name="History" component={HistoryScreen} options={{ title: "History" }} />
          <Stack.Screen name="People" component={PeopleScreen} options={{ title: "Payees" }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
