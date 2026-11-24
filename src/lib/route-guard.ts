// Where someone belongs right now, given their session, consent, profile and whether they've seen onboarding.

export type Where = 'onboarding' | 'signIn' | 'consent' | 'profile' | 'app';

export function destinationFor({
  session, needsConsent = false, needsProfile, onboarded,
}: {
  session: boolean; needsConsent?: boolean; needsProfile: boolean; onboarded: boolean;
}): Where {
  // consent comes before the profile: nothing about their health is collected until they've agreed
  if (session) return needsConsent ? 'consent' : needsProfile ? 'profile' : 'app';
  return onboarded ? 'signIn' : 'onboarding';
}

/** The first path segment tells us which group a route is in. */
export function groupOf(segments: string[]): Where | 'other' {
  if (segments[0] === '(auth)') {
    if (segments[1] === 'onboarding') return 'onboarding';
    if (segments[1] === 'consent') return 'consent';
    if (segments[1] === 'create-profile') return 'profile';
    return 'signIn';
  }
  return 'app';
}

/** Is the screen someone is on acceptable for where they belong? */
export function isAllowed(where: Where, current: Where | 'other') {
  // sign-in and the code screen are the same place as far as the guard is concerned
  if (where === 'signIn') return current === 'signIn' || current === 'onboarding';
  if (where === 'onboarding') return current === 'onboarding' || current === 'signIn';
  return current === where;
}

export const PATHS: Record<Where, string> = {
  onboarding: '/(auth)/onboarding',
  signIn: '/(auth)/sign-in',
  consent: '/(auth)/consent',
  profile: '/(auth)/create-profile',
  app: '/(tabs)',
};
