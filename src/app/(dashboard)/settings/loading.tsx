export default function SettingsLoading() {
  return (
    <div className="settings-loading" aria-busy="true" aria-live="polite">
      <span className="page-loading-spinner" />
      <span>Loading settings…</span>
    </div>
  );
}
