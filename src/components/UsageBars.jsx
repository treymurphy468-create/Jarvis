import UsageBar from '../components/UsageBar';

export default function UsageBars({ credits, session, creditsLimited, sessionLimited }) {
  return (
    <div className="usage-bars">
      <UsageBar meter={credits} limited={creditsLimited} variant="credits" />
      <UsageBar meter={session} limited={sessionLimited} variant="rpm" />
    </div>
  );
}
