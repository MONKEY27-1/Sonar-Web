// Wires every [data-download-button] on the page to the newest GitHub Release's installer
// asset. Degrades gracefully when no release exists yet (e.g. before the first `vX.Y.Z` tag
// is cut) instead of leaving a dead link — see installer/README.md in the app repo for how a
// release with SonarSetup.exe attached actually gets created.
document.addEventListener("DOMContentLoaded", async () => {
  const buttons = document.querySelectorAll("[data-download-button]");
  if (buttons.length === 0) return;

  const releasesUrl = `https://github.com/${SONAR_CONFIG.githubOwner}/${SONAR_CONFIG.githubRepo}/releases`;
  const apiBase = `https://api.github.com/repos/${SONAR_CONFIG.githubOwner}/${SONAR_CONFIG.githubRepo}/releases`;

  try {
    const release = await fetchNewestRelease();
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

  // GET /releases/latest only ever returns the newest *full* (non-draft, non-prerelease)
  // release — it 404s if every release so far is tagged "pre-release" on GitHub, which is
  // exactly the case for a "vX.Y.Z beta" tag. Fall back to listing all public releases
  // (newest first) and taking the first one, so beta tags still show up as a download.
  async function fetchNewestRelease() {
    const latest = await fetch(`${apiBase}/latest`);
    if (latest.ok) return latest.json();

    const all = await fetch(`${apiBase}?per_page=1`);
    if (!all.ok) throw new Error("no releases yet");

    const releases = await all.json();
    if (!releases.length) throw new Error("no releases yet");
    return releases[0];
  }
});
