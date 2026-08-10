// Wires every [data-download-button] on the page to the latest GitHub Release's installer
// asset. Degrades gracefully when no release exists yet (e.g. before the first `vX.Y.Z` tag
// is cut) instead of leaving a dead link — see installer/README.md in the app repo for how a
// release with SonarSetup.exe attached actually gets created.
document.addEventListener("DOMContentLoaded", async () => {
  const buttons = document.querySelectorAll("[data-download-button]");
  if (buttons.length === 0) return;

  const releasesUrl = `https://github.com/${SONAR_CONFIG.githubOwner}/${SONAR_CONFIG.githubRepo}/releases`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${SONAR_CONFIG.githubOwner}/${SONAR_CONFIG.githubRepo}/releases/latest`
    );

    if (!response.ok) throw new Error("no release yet");

    const release = await response.json();
    const asset = (release.assets || []).find((a) => a.name.toLowerCase().endsWith(".exe"));

    buttons.forEach((btn) => {
      btn.href = asset ? asset.browser_download_url : releasesUrl;
      const label = btn.querySelector("[data-download-label]") || btn;
      label.textContent = asset ? `Download for Windows (${release.tag_name})` : "View Releases";
    });
  } catch {
    buttons.forEach((btn) => {
      btn.href = releasesUrl;
      const label = btn.querySelector("[data-download-label]") || btn;
      label.textContent = "Download — Coming Soon";
      btn.classList.add("btn-disabled-note");
    });
  }
});
