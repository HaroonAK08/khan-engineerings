export type RootStackParamList = {
  Pin: undefined;
  Home: undefined;
  Banks: undefined;
  Bank: { bankId: string; bankName: string };
  Account: { accountId: string; accountName: string; bankId: string; bankName: string };
  Send: { accountId?: string; accountName?: string; recipient?: string } | undefined;
  Receive: { accountId?: string; from?: string } | undefined;
  History: { accountId?: string; bankId?: string; recipient?: string } | undefined;
  People: undefined;
};
