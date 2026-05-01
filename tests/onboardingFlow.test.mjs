import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile('src/App.tsx', 'utf8');
const onboardingSource = await readFile('src/pages/OnboardingPage.tsx', 'utf8');
const profileApiSource = await readFile('api/profile.ts', 'utf8');

assert.match(appSource, /OnboardingGate/, 'app should guard private routes for incomplete onboarding');
assert.match(appSource, /path="\/onboarding"/, 'app should expose an onboarding route');
assert.match(onboardingSource, /Use your Truvlo wallet/, 'onboarding should use friendly embedded-wallet copy');
assert.match(onboardingSource, /Import an existing wallet/, 'onboarding should offer importing an existing wallet');
assert.match(onboardingSource, /displayName/, 'onboarding should collect display name');
assert.match(onboardingSource, /notificationEmail/, 'onboarding should collect notification email');
assert.match(onboardingSource, /onboarding_completed_at/, 'onboarding should mark completion');
assert.match(profileApiSource, /onboarding_completed_at/, 'profile API should return and update onboarding completion');

console.log('onboarding flow tests passed');
