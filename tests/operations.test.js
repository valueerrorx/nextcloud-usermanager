// S07 A2 Abnahme 6: every action id builds the documented request(s); an unknown id throws.
import { describe, expect, it, vi } from 'vitest';
import { getSteps } from '../src/main/actions/operations.js';

function fakeClient() {
  const request = vi.fn(async () => ({ ok: true, data: null, httpStatus: 200, versuche: 1 }));
  return { request };
}

describe('getSteps', () => {
  it('user.enable -> ein Schritt, PUT /cloud/users/{id}/enable', async () => {
    const client = fakeClient();
    const steps = getSteps('user.enable', 'alice', {});
    expect(steps).toHaveLength(1);
    await steps[0].run(client);
    expect(client.request).toHaveBeenCalledWith({ method: 'PUT', path: '/cloud/users/alice/enable' });
  });

  it('user.disable -> ein Schritt, PUT /cloud/users/{id}/disable', async () => {
    const client = fakeClient();
    const steps = getSteps('user.disable', 'alice', {});
    await steps[0].run(client);
    expect(client.request).toHaveBeenCalledWith({ method: 'PUT', path: '/cloud/users/alice/disable' });
  });

  it('user.delete -> ein Schritt, DELETE /cloud/users/{id}', async () => {
    const client = fakeClient();
    const steps = getSteps('user.delete', 'alice', {});
    await steps[0].run(client);
    expect(client.request).toHaveBeenCalledWith({ method: 'DELETE', path: '/cloud/users/alice' });
  });

  it('user.setQuota -> ein Schritt, PUT mit key=quota', async () => {
    const client = fakeClient();
    const steps = getSteps('user.setQuota', 'alice', { value: '5 GB' });
    await steps[0].run(client);
    expect(client.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/cloud/users/alice',
      form: { key: 'quota', value: '5 GB' },
    });
  });

  it('user.setPassword -> ein Schritt, PUT mit key=password', async () => {
    const client = fakeClient();
    const steps = getSteps('user.setPassword', 'alice', { value: 'Geheim123!' });
    await steps[0].run(client);
    expect(client.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/cloud/users/alice',
      form: { key: 'password', value: 'Geheim123!' },
    });
  });

  it('user.addToGroup -> ein Schritt, POST /cloud/users/{id}/groups mit groupid', async () => {
    const client = fakeClient();
    const steps = getSteps('user.addToGroup', 'alice', { groupid: 'admins' });
    await steps[0].run(client);
    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/cloud/users/alice/groups',
      form: { groupid: 'admins' },
    });
  });

  it('user.removeFromGroup -> ein Schritt, DELETE /cloud/users/{id}/groups mit groupid', async () => {
    const client = fakeClient();
    const steps = getSteps('user.removeFromGroup', 'alice', { groupid: 'admins' });
    await steps[0].run(client);
    expect(client.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: '/cloud/users/alice/groups',
      form: { groupid: 'admins' },
    });
  });

  it('user.update mit nur displayname -> genau ein Schritt', async () => {
    const client = fakeClient();
    const steps = getSteps('user.update', 'alice', { displayname: 'Alice A.' });
    expect(steps).toHaveLength(1);
    await steps[0].run(client);
    expect(client.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/cloud/users/alice',
      form: { key: 'displayname', value: 'Alice A.' },
    });
  });

  it('user.update mit displayname UND email -> genau zwei Schritte, je ein eigener PUT', async () => {
    const client = fakeClient();
    const steps = getSteps('user.update', 'alice', { displayname: 'Alice A.', email: 'alice@example.com' });
    expect(steps).toHaveLength(2);
    await steps[0].run(client);
    await steps[1].run(client);
    expect(client.request).toHaveBeenNthCalledWith(1, {
      method: 'PUT',
      path: '/cloud/users/alice',
      form: { key: 'displayname', value: 'Alice A.' },
    });
    expect(client.request).toHaveBeenNthCalledWith(2, {
      method: 'PUT',
      path: '/cloud/users/alice',
      form: { key: 'email', value: 'alice@example.com' },
    });
  });

  it('unbekannte Action-ID wirft', () => {
    expect(() => getSteps('user.doesNotExist', 'alice', {})).toThrow();
  });
});
