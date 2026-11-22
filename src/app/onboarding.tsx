import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';
import { useSession } from '@/features/session/AppSession';

export default function OnboardingRoute() {
  const { markOnboarded } = useSession();
  return <OnboardingFlow onDone={markOnboarded} />;
}
