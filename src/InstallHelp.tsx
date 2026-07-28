export function InstallHelp() {
  if (window.matchMedia("(display-mode: standalone)").matches) return null;

  return (
    <details className="install-help">
      <summary>Install as an app</summary>
      <p><strong>iPhone</strong> Open this page in Safari, tap Share, then Add to Home Screen and enable Open as Web App.</p>
      <p><strong>Android</strong> Open this page in Chrome, open the browser menu, then choose Install app or Add to Home screen.</p>
    </details>
  );
}
