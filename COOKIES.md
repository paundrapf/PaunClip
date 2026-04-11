# YouTube Cookies Guide

This guide explains how to export and use cookies.txt for PaunClip.

---

## English

### Why Cookies Are Required

YouTube requires authentication to access video data. The `cookies.txt` file contains your YouTube session cookies, allowing the app to download videos on your behalf.

### Required Cookies

Your cookies.txt must contain these YouTube authentication cookies:
- `SID`
- `HSID`
- `SSID`
- `APISID`
- `SAPISID`
- `LOGIN_INFO`

### How to Export Cookies

#### Method 1: Browser Extension (Recommended)

1. Install a cookies export extension:
   - **Chrome/Edge**: [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - **Firefox**: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. Open [youtube.com](https://youtube.com) in your browser

3. **Make sure you are logged in** to your YouTube/Google account

4. Click the extension icon and export cookies

5. Save the file as `cookies.txt`

6. Upload the file in the PaunClip home page

### Troubleshooting

**Error: "Sign in to confirm you're not a bot"**
- Your cookies are expired or invalid
- Export fresh cookies while logged into YouTube

**Error: "HTTP Error 403: Forbidden"**
- Your cookies are expired (typically last 1-2 weeks)
- Export fresh cookies while logged into YouTube
- Make sure you're logged in when exporting

**Error: "The downloaded file is empty"**
- YouTube detected bot activity
- Your cookies are not strong enough for video content
- **Solution:**
  1. Open browser in **Incognito/Private mode**
  2. Go to youtube.com and **login** to your Google account
  3. Watch 2-3 videos **completely** (don't skip)
  4. Open the video you want to download, watch for a bit
  5. Export fresh cookies using the extension
  6. Upload the new cookies.txt
- **Tip:** Use an account that actively watches YouTube

**Error: "Missing YouTube authentication cookies"**
- Your cookies.txt is incomplete
- Make sure you export from youtube.com while logged in

**Cookies expire quickly**
- YouTube cookies typically last 1-2 weeks
- Re-export when you see authentication errors
- Use an active YouTube account for better cookie longevity

**Still having issues? Update yt-dlp:**
- YouTube frequently changes their protection
- Update yt-dlp to the latest version:
  ```bash
  pip install --upgrade yt-dlp
  ```
- Check latest version: https://github.com/yt-dlp/yt-dlp/releases
- Recommended: yt-dlp >= 2026.2.4

### Security Notes

- Never share your cookies.txt file
- Cookies contain your YouTube session - treat them like passwords
- The app stores cookies locally and never uploads them anywhere

---

## Bahasa Indonesia

### Mengapa Cookies Diperlukan

YouTube memerlukan autentikasi untuk mengakses data video. File `cookies.txt` berisi cookies sesi YouTube kamu, memungkinkan aplikasi untuk mendownload video atas nama kamu.

### Cookies yang Diperlukan

File cookies.txt harus berisi cookies autentikasi YouTube berikut:
- `SID`
- `HSID`
- `SSID`
- `APISID`
- `SAPISID`
- `LOGIN_INFO`

### Cara Export Cookies

#### Metode 1: Extension Browser (Direkomendasikan)

1. Install extension untuk export cookies:
   - **Chrome/Edge**: [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - **Firefox**: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. Buka [youtube.com](https://youtube.com) di browser

3. **Pastikan sudah login** ke akun YouTube/Google

4. Klik icon extension dan export cookies

5. Simpan file sebagai `cookies.txt`

6. Upload file di halaman utama PaunClip

### Troubleshooting

**Error: "Sign in to confirm you're not a bot"**
- Cookies sudah expired atau tidak valid
- Export cookies baru saat sedang login ke YouTube

**Error: "HTTP Error 403: Forbidden"**
- Cookies sudah expired (biasanya bertahan 1-2 minggu)
- Export cookies baru saat sedang login ke YouTube
- Pastikan sudah login saat export cookies

**Error: "The downloaded file is empty"**
- YouTube mendeteksi aktivitas bot
- Cookies tidak cukup kuat untuk akses video content
- **Solusi:**
  1. Buka browser dalam mode **Incognito/Private**
  2. Buka youtube.com dan **login** ke akun Google
  3. Tonton 2-3 video **sampai selesai** (jangan skip)
  4. Buka video yang ingin di-download, tonton sebentar
  5. Export cookies baru menggunakan extension
  6. Upload cookies.txt yang baru
- **Tips:** Gunakan akun yang aktif menonton YouTube

**Error: "Missing YouTube authentication cookies"**
- File cookies.txt tidak lengkap
- Pastikan export dari youtube.com saat sudah login

**Cookies cepat expired**
- Cookies YouTube biasanya bertahan 1-2 minggu
- Export ulang jika muncul error autentikasi
- Gunakan akun YouTube yang aktif untuk cookies lebih tahan lama

**Masih error? Update yt-dlp:**
- YouTube sering mengubah proteksi mereka
- Update yt-dlp ke versi terbaru:
  ```bash
  pip install --upgrade yt-dlp
  ```
- Cek versi terbaru: https://github.com/yt-dlp/yt-dlp/releases
- Direkomendasikan: yt-dlp >= 2026.2.4

### Catatan Keamanan

- Jangan pernah share file cookies.txt
- Cookies berisi sesi YouTube kamu - perlakukan seperti password
- Aplikasi menyimpan cookies secara lokal dan tidak pernah upload ke mana pun
