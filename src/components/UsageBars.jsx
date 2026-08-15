import UsageBar from '../components/UsageBar';

export default function UsageBars({ session, sessionLimited }) {
  return (
    <div className="usage-bars">
      <UsageBar meter={session} limited={sessionLimited} variant="rpm" />
    </div>
  );
}
