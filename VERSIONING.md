# 🏷️ Versioning Policy & Release Guidelines

All releases and tags in the **PennyWise** repository must strictly adhere to **Semantic Versioning (SemVer 2.0.0)** with a leading `v`. 

Any release or tag that violates this format will be **automatically rejected and failed by GitHub Actions**.

---

## 📌 Allowed Version Formats

### 1. Stable Production Releases
Format: `v<MAJOR>.<MINOR>.<PATCH>`

* **`MAJOR`**: Breaking architectural changes.
* **`MINOR`**: New backwards-compatible features.
* **`PATCH`**: Backwards-compatible bug fixes and performance improvements.

**Examples:**
* `v1.0.0`
* `v1.0.1`
* `v1.2.0`
* `v2.0.0`

---

### 2. Pre-Releases (Alpha, Beta, Release Candidates)
Format: `v<MAJOR>.<MINOR>.<PATCH>-<STAGE>.<NUMBER>`

Allowed stages: `alpha`, `beta`, `rc` (or any hyphen-separated identifier).

**Examples:**
* `v1.0.0-alpha.1`
* `v1.0.0-beta.1`
* `v1.0.0-rc.1`
* `v2.0.0-beta.2`

---

## ❌ Rejected Formats (Will Fail in CI)

| Invalid Tag | Reason for Failure | Correct Format |
| :--- | :--- | :--- |
| `1.0.0` | Missing leading `v` | `v1.0.0` |
| `v1.0` | Missing patch version | `v1.0.0` |
| `v1` | Missing minor and patch | `v1.0.0` |
| `v01.0.0` | Leading zeros in numbers | `v1.0.0` |
| `test-release` | Non-semantic name | `v0.1.0-alpha.1` |
| `v1.0.0.0` | Four number segments | `v1.0.0` |
| `latest` | Generic word tag | `v1.0.0` |

---

## ⚙️ How the CI Pipeline Handles Releases

```
                           ┌──► Pre-Release (e.g. v1.0.0-beta.1)
                           │    • Builds PennyWise-v1.0.0-beta.1.apk
                           │    • Attaches APK to GitHub Release for testers
Git Tag / GitHub Release ──┤    • 🛡️ SKIPS Vercel (Does not affect live PWA)
                           │
                           └──► Stable Release (e.g. v1.0.0)
                                • Builds PennyWise-v1.0.0.apk
                                • Attaches APK to GitHub Release
                                • 🚀 TRIGGERS Vercel PWA Production Deployment
```

---

## 🚀 How to Create a Release

### Method A: Via GitHub Web UI (Recommended)
1. Go to your repository on GitHub.
2. Click **Releases** > **Draft a new release**.
3. In **Choose a tag**, enter a valid tag (e.g. `v1.0.0` or `v1.0.0-beta.1`).
4. Enter a release title and changelog notes.
5. If it is a pre-release, check the **"Set as a pre-release"** box.
6. Click **Publish release**.

### Method B: Via Git CLI
```bash
# 1. Create a tag
git tag v1.0.0-beta.1

# 2. Push the tag to GitHub
git push origin v1.0.0-beta.1
```
