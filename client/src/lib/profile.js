// Both fields are required together — an account with only one set (which
// shouldn't happen via the API, since PATCH /auth/profile validates both,
// but could via a partial DB edit) still needs the gate.
export function profileComplete(account) {
  return Boolean(account?.parent_name && account?.emergency_phone);
}
