const VAULT_TOKEN_KEY = "ke_vault_token";

export function getVaultToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(VAULT_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setVaultToken(token: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(VAULT_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearVaultToken() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(VAULT_TOKEN_KEY);
  } catch {
    // ignore
  }
}
