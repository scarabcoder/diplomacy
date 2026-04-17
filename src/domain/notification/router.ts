import {
  getMyPreferences,
  getUnreadMessageCount,
  getVapidPublicKey,
  listMyWebPushSubscriptions,
  subscribeWebPush,
  unsubscribeWebPush,
  updateMyPreferences,
} from './procedures.ts';

export const notificationRouter = {
  getVapidPublicKey,
  getMyPreferences,
  updateMyPreferences,
  subscribeWebPush,
  unsubscribeWebPush,
  listMyWebPushSubscriptions,
  getUnreadMessageCount,
};
