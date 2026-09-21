export const accountHeaders = session => ({ "X-Account-Id": session.accountId, "X-Account-Token": session.token });
export async function mockAccount(base, displayName = "模拟听众 A") {
  const created = await fetch(`${base}/api/host/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
  if (created.status !== 201) throw new Error(`Mock host provisioning failed: ${created.status}`);
  const identity = await created.json();
  const response = await fetch(`${base}/api/host/resume`, { method: "POST", headers: { "Content-Type": "application/json", "X-Account-Id": identity.accountId }, body: JSON.stringify({ deviceKey: identity.deviceKey }) });
  if (!response.ok) throw new Error(`Mock host resume failed: ${response.status}`);
  return { identity, session: await response.json() };
}
