import { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, View } from "react-native";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getToken } from "./src/lib/api";
import { getAuthStatus, type AuthStatus } from "./src/lib/banks-api";
import type { RootStackParamList } from "./src/navigation/types";
import { NotifyProvider } from "./src/components/Notify";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { lightColors } from "./src/theme";
import { PinScreen } from "./src/screens/PinScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { BanksScreen } from "./src/screens/BanksScreen";
import { BankScreen } from "./src/screens/BankScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { SendScreen } from "./src/screens/SendScreen";
import { ReceiveScreen } from "./src/screens/ReceiveScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { PeopleScreen } from "./src/screens/PeopleScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

function ThemeAwareNav({
  status,
  unlocked,
  setUnlocked,
  setStatus,
}: {
  status: AuthStatus;
  unlocked: boolean;
  setUnlocked: (v: boolean) => void;
  setStatus: (s: AuthStatus) => void;
}) {
  const { colors, isDark } = useTheme();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.bg}
      />
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
            animationDuration: 220,
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            freezeOnBlur: true,
          }}
        >
          <Stack.Screen name="Pin" options={{ headerShown: false, animation: "fade" }}>
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
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false, animation: "fade" }} />
          <Stack.Screen
            name="Banks"
            component={BanksScreen}
            options={{ title: "Banks", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="Bank"
            component={BankScreen}
            options={{ title: "Accounts", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="Account"
            component={AccountScreen}
            options={{ title: "Account", animation: "slide_from_right" }}
          />
          <Stack.Screen name="Send" component={SendScreen} options={{ title: "Pay" }} />
          <Stack.Screen name="Receive" component={ReceiveScreen} options={{ title: "Receive" }} />
          <Stack.Screen name="History" component={HistoryScreen} options={{ title: "History" }} />
          <Stack.Screen name="People" component={PeopleScreen} options={{ title: "Payees" }} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

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
      <View style={{ flex: 1, backgroundColor: lightColors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={lightColors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NotifyProvider>
          <ThemeAwareNav
            status={status}
            unlocked={unlocked}
            setUnlocked={setUnlocked}
            setStatus={setStatus}
          />
        </NotifyProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
