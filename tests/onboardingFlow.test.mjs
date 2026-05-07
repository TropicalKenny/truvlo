import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile('src/App.tsx', 'utf8');
const onboardingSource = await readFile('src/pages/OnboardingPage.tsx', 'utf8');
const onboardingGateSource = await readFile('src/components/OnboardingGate.tsx', 'utf8');
const profileApiSource = await readFile('api/profile.ts', 'utf8');

assert.match(appSource, /OnboardingGate/, 'app should wrap private routes with setup guidance');
assert.match(appSource, /path="\/onboarding"/, 'app should expose an onboarding route');
assert.match(onboardingSource, /Use your Truvlo wallet/, 'onboarding should use friendly embedded-wallet copy');
assert.match(onboardingSource, /useCreateWallet/, 'onboarding should create a Truvlo wallet when none exists');
assert.match(onboardingSource, /truvloWallet \?\? await createWallet/, 'onboarding should create a wallet instead of waiting for one to already exist');
assert.match(onboardingSource, /Import an existing wallet/, 'onboarding should offer importing an existing wallet');
assert.match(onboardingSource, /displayName/, 'onboarding should collect display name');
assert.match(onboardingSource, /notificationEmail/, 'onboarding should collect notification email');
assert.match(onboardingSource, /onboarding_completed_at/, 'onboarding should mark completion');
assert.match(profileApiSource, /onboarding_completed_at/, 'profile API should return and update onboarding completion');
assert.doesNotMatch(onboardingGateSource, /<Navigate to="\/onboarding"/, 'incomplete onboarding should not force users away from private routes');
assert.match(onboardingGateSource, /Finish setup when you are ready/, 'private routes should show a non-blocking setup prompt');
assert.match(onboardingGateSource, /setSetupPromptDismissed\(true\)/, 'setup prompt should be skippable');
assert.match(onboardingGateSource, /profileComplete && walletComplete/, 'setup prompt should still track both profile and wallet onboarding');

console.log('onboarding flow tests passed');
