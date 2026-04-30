const routePreloaders: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('../pages/DashboardPage'),
  '/create': () => import('../pages/CreateInvoicePage'),
  '/account': () => import('../pages/AccountPage'),
  '/settings': () => import('../pages/ProfileSettingsPage'),
  '/wallet': () => import('../pages/WalletPage'),
  '/onboarding': () => import('../pages/OnboardingPage'),
};

const preloadedRoutes = new Set<string>();

export function preloadRoute(path: string) {
  const loader = routePreloaders[path];
  if (!loader || preloadedRoutes.has(path)) return;

  preloadedRoutes.add(path);
  void loader().catch(() => preloadedRoutes.delete(path));
}
