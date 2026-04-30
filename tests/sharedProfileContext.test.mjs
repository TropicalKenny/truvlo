import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contextSource = await readFile('src/contexts/AuthProfileContext.tsx', 'utf8');
const gateSource = await readFile('src/components/OnboardingGate.tsx', 'utf8');
const appSource = await readFile('src/App.tsx', 'utf8');

assert.match(contextSource, /AuthProfileProvider/, 'shared auth profile provider should exist');
assert.match(contextSource, /useAuthProfile/, 'shared auth profile hook should exist');
assert.match(contextSource, /localStorage/, 'profile provider should cache profile data');
assert.match(contextSource, /refreshProfile/, 'profile provider should expose refreshProfile');
assert.match(contextSource, /profileFromCache/, 'profile provider should expose cache state');
assert.match(appSource, /AuthProfileProvider/, 'app should mount the shared profile provider');
assert.match(gateSource, /useAuthProfile/, 'onboarding gate should consume shared profile state');
assert.doesNotMatch(gateSource, /fetch\('\/api\/profile'/, 'onboarding gate should not fetch profile independently');

for (const path of [
  'src/pages/AccountPage.tsx',
  'src/pages/ProfileSettingsPage.tsx',
  'src/pages/OnboardingPage.tsx',
  'src/components/Dashboard.tsx',
]) {
  const source = await readFile(path, 'utf8');
  assert.match(source, /useAuthProfile/, `${path} should consume shared profile data`);
}

console.log('shared profile context tests passed');
