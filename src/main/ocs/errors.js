// Endpoint-local error mapping, moved here from S03 (ARCHITECTURE §7, REVIEW-NOTES 3): codes are
// endpoint-specific, so there is no global code table in this file - callers bring their own map.
import { MESSAGES } from '../../shared/messages.js';

// Throws instead of silently writing `message: undefined` - a typo'd messageId in an endpoint
// map or fallbackId must surface during development, not degrade to a message-less error.
function lookupMessage(messageId) {
  const message = MESSAGES[messageId];
  if (message === undefined) {
    throw new Error(`mapOcsError: unknown messageId '${messageId}'`);
  }
  return message;
}

export function mapOcsError(result, endpointMap, fallbackId) {
  if (result.ok === true) {
    throw new Error('mapOcsError: result.ok must be false');
  }
  // Only kind 'ocs' (a real OCS statuscode != 100) gets endpoint-specific translation; every
  // other kind (auth/forbidden/ratelimit/notOcs/network/timeout/cert/http) keeps its messageId.
  if (result.kind !== 'ocs') {
    return result;
  }
  const messageId = endpointMap[result.ocsCode] ?? fallbackId;
  return { ...result, messageId, message: lookupMessage(messageId) };
}
