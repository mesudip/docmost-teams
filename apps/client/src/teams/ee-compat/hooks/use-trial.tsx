// Trials exist on Docmost Cloud only.
export default function useTrial(): {
  isTrial: boolean;
  trialDaysLeft: number | null;
} {
  return { isTrial: false, trialDaysLeft: null };
}
