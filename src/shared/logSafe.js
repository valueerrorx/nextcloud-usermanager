// One-line, secret-free description of a thrown value for main-process logs (REVIEW-NOTES 8).
export function describeError(error, secrets = []) {
  let text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  text = text.replace(/Basic\s+[A-Za-z0-9+/=._-]+/gi, 'Basic [redacted]');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret !== '') text = text.split(secret).join('[redacted]');
  }
  return text;
}
