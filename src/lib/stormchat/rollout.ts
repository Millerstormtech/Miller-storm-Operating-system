// Rollout switch for GROUP ADMINS (decided by Youssef, 2026-10-15).
//
// The phone app shipped before 2026-10-15 lets ONLY group admins type in any
// group that has a group admin (Jamesapk storm_chat_room_screen.dart), so the
// moment a group gets an admin its regular members are locked out on phones.
// Until Krupali's phone update (which uses the server's myRights) is in the
// stores, no group may get an admin:
//   - "Create group" and "Make admin" are hidden on the website;
//   - the server never makes a creator admin and refuses to add new admins.
// Company Admins keep managing every group (that needs no admin list, so it
// doesn't affect phones).
//
// Turn ON after the phone update ships: set
//   NEXT_PUBLIC_STORMCHAT_GROUP_ADMINS=on
// in the server's .env and rebuild (NEXT_PUBLIC_ values are baked in at build).
export const GROUP_ADMINS_ENABLED = process.env.NEXT_PUBLIC_STORMCHAT_GROUP_ADMINS === 'on';
