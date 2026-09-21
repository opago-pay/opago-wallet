import { deleteSecureItem, getSecureItem, setSecureItem } from './storage';
import { HomeBalancePreviewStore } from './home-balance-preview';

const KEY = 'opago_home_balance_preview_v1';
export const homeBalancePreviewStore = new HomeBalancePreviewStore({
  get: () => getSecureItem(KEY),
  set: value => setSecureItem(KEY, value),
  remove: () => deleteSecureItem(KEY),
});
