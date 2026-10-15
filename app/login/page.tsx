import LoginView, { type LoginDefaults } from './login-view';

export const dynamic = 'force-dynamic';

/**
 * Pre-fills the sign-in form from LOGIN_DEFAULT_EMAIL / LOGIN_DEFAULT_PASSWORD (falling back to the seeded admin).
 * On by default in development only; set LOGIN_PREFILL=true/false to override.
 */
function loginDefaults(): LoginDefaults | undefined {
  const flag = process.env.LOGIN_PREFILL;
  const enabled = flag ? flag === 'true' : process.env.NODE_ENV !== 'production';
  if (!enabled) return undefined;
  const email = process.env.LOGIN_DEFAULT_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? '';
  const password = process.env.LOGIN_DEFAULT_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? '';
  return email || password ? { email, password } : undefined;
}

export default function LoginPage() {
  return <LoginView defaults={loginDefaults()} />;
}
