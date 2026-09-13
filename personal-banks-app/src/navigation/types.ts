export type RootStackParamList = {
  Pin: undefined;
  Home: undefined;
  Bank: { bankId: string; bankName: string };
  Send: { accountId?: string; accountName?: string; recipient?: string } | undefined;
  History: { accountId?: string; bankId?: string; recipient?: string } | undefined;
  People: undefined;
};
