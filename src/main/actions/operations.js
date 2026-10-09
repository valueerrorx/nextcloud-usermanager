// Action-ID -> one or two OCS steps (ARCHITECTURE §5, S07-batch-kern.md A2).
import {
  createUser,
  enableUser,
  disableUser,
  deleteUser,
  setUserField,
  addUserToGroup,
  removeUserFromGroup,
} from '../ocs/users.js';
import { MESSAGES } from '../../shared/messages.js';

// Each step runs against a single client and names itself - the name feeds ItemResult.grund
// when a later step in the same action fails (user.update's 'teilweise' case).
const OPERATIONS = {
  'user.enable': (userid) => [{ name: 'enable', run: (client) => enableUser(client, userid) }],
  'user.disable': (userid) => [{ name: 'disable', run: (client) => disableUser(client, userid) }],
  'user.delete': (userid) => [{ name: 'delete', run: (client) => deleteUser(client, userid) }],
  'user.setQuota': (userid, params) => [
    { name: 'quota', run: (client) => setUserField(client, userid, 'quota', params.value) },
  ],
  'user.setPassword': (userid, params) => [
    { name: 'password', run: (client) => setUserField(client, userid, 'password', params.value) },
  ],
  'user.addToGroup': (userid, params) => [
    { name: 'addToGroup', run: (client) => addUserToGroup(client, userid, params.groupid) },
  ],
  'user.removeFromGroup': (userid, params) => [
    { name: 'removeFromGroup', run: (client) => removeUserFromGroup(client, userid, params.groupid) },
  ],
  // S11 A2: user.create is deliberately two-step - POST /cloud/users without groups[], then one
  // addUserToGroup per target group. params.byUserid carries the per-row password/displayName
  // (every item has its own, unlike every other action's shared params); params.groups and
  // params.quota are the same for the whole job. A group step's own name is the groupid, so the
  // pipeline's 'teilweise' sentence names the group that could not be assigned.
  'user.create': (userid, params) => {
    const { password, displayName } = params.byUserid[userid];
    const steps = [
      { name: 'create', run: (client) => createUser(client, { userid, password, displayName, quota: params.quota }) },
    ];
    for (const groupid of params.groups ?? []) {
      steps.push({
        name: groupid,
        teilfehlerGrund: `Gruppe "${groupid}" konnte nicht zugewiesen werden`,
        run: (client) => addUserToGroup(client, userid, groupid),
      });
    }
    return steps;
  },
  // The only other multi-step action: PUT /cloud/users/{userid} takes exactly one key/value pair
  // (RESEARCH-OCS §2), so changing both fields is two requests. Only the fields present in
  // params become a step, so changing one field stays single-step.
  'user.update': (userid, params) => {
    const steps = [];
    if (params.displayname !== undefined) {
      steps.push({ name: 'displayname', run: (client) => setUserField(client, userid, 'displayname', params.displayname) });
    }
    if (params.email !== undefined) {
      steps.push({ name: 'email', run: (client) => setUserField(client, userid, 'email', params.email) });
    }
    return steps;
  },
};

// Throws for an unknown action id - a programming error (A2), never a runtime case that should
// be reported per-item.
export function getSteps(action, userid, params = {}) {
  const build = OPERATIONS[action];
  if (!build) {
    throw new Error(MESSAGES.unbekannte_aktion);
  }
  return build(userid, params);
}
