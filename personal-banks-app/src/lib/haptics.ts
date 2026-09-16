import { Vibration } from "react-native";

export function hapticLight() {
  try {
    Vibration.vibrate(12);
  } catch {
    /* noop */
  }
}

export function hapticSuccess() {
  try {
    Vibration.vibrate([0, 18, 40, 18]);
  } catch {
    /* noop */
  }
}
