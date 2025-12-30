# RsExtractor

<p align="center">
  <img src="src-tauri/icons/icon.png" alt="RsExtractor Logo" width="128" height="128">
</p>

<p align="center">
  <strong>A modern tool for extracting and merging multimedia tracks</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#technologies">Technologies</a>
</p>

---

## 📖 Description

RsExtractor is a desktop application that allows you to easily extract and merge audio, video, and subtitle tracks from multimedia files (MKV, MP4, etc.).

Designed with an intuitive and modern interface, it simplifies common multimedia file manipulation tasks without requiring technical command-line knowledge.

## ✨ Features

### 🎬 Track Extraction

- **Drag & drop import**: Drop your video files directly into the application
- **Automatic analysis**: Detection of all tracks (video, audio, subtitles)
- **Intuitive selection**: Choose tracks to extract with filters by type and language
- **Quick selection**: Select all French subtitles with one click
- **Batch extraction**: Process multiple files simultaneously
- **MKS/MKA support**: Extract tracks from Matroska subtitle and audio containers

### 🔀 Track Merging (Batch)

- **Import multiple sources**: Add an entire anime series at once
- **External drag & drop**: Import subtitle files (.ass, .srt) and audio files (.aac, .flac) directly from your file explorer
- **Smart auto-matching**: Automatically match tracks to videos by episode number
- **Manual assignment**: Drag and drop tracks onto specific videos
- **Track configuration**:
  - Set language and title
  - Adjust timing offset (delay)
  - Set default track flags
  - Mark subtitles as forced
- **Drag & drop reordering**: Change track order in the output file
- **Batch processing**: Merge tracks into all episodes in one operation
- **Duplicate prevention**: Cannot import the same file twice

### ⚙️ Settings

- **Customizable theme**: Light, dark, or automatic (follows system)
- **FFmpeg configuration**: Set custom FFmpeg/FFprobe paths
- **Persistent settings**: All preferences are saved between sessions
- **Collapsible sidebar**: More workspace when needed

## 📋 Requirements

- **FFmpeg**: Must be installed on your system
  - macOS: `brew install ffmpeg`
  - Windows: [Download FFmpeg](https://ffmpeg.org/download.html)
  - Linux: `sudo apt install ffmpeg` (Debian/Ubuntu)

## 💻 Installation

### Download

Download the latest version for your operating system from the [Releases](https://github.com/your-repo/rsextractor/releases) page.

| System | File |
|--------|------|
| macOS | `RsExtractor_x.x.x_aarch64.dmg` or `RsExtractor_x.x.x_x64.dmg` |
| Windows | `RsExtractor_x.x.x_x64-setup.exe` |
| Linux | `RsExtractor_x.x.x_amd64.deb` or `.AppImage` |

### Building from Source

```bash
# Clone the repository
git clone https://github.com/your-repo/rsextractor.git
cd rsextractor

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build the application
pnpm tauri build
```

## 🚀 Usage

### Extracting Tracks

1. **Import files**: Drag & drop your MKV/MP4/MKS/MKA files or click "Import"
2. **Select tracks**: Use quick filters or manually check the tracks you want
3. **Choose destination**: Click the folder icon to select output folder
4. **Start extraction**: Click "Extract"

### Merging Tracks (Batch)

1. **Add video files**: Import your video series (e.g., anime episodes)
2. **Add tracks**: Drag & drop .ass, .srt, .aac files, or click "Add tracks"
3. **Auto-match**: Click "Auto-match" to automatically pair tracks with videos by episode number
4. **Manual adjustments**: Drag tracks to specific videos if needed
5. **Configure tracks**: Click the gear icon to set language, delay, or flags
6. **Reorder**: Drag tracks within a video to change their order
7. **Set output folder**: Choose where merged files will be saved
8. **Merge**: Click "Merge X files" to process all videos

## 🛠️ Technologies

RsExtractor is built with modern technologies:

- **[Tauri](https://tauri.app/)** - Framework for lightweight and secure desktop applications
- **[Svelte 5](https://svelte.dev/)** - Reactive and performant JavaScript framework
- **[TypeScript](https://www.typescriptlang.org/)** - Typed JavaScript for robustness
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[shadcn-svelte](https://www.shadcn-svelte.com/)** - Elegant UI components
- **[svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action)** - Drag and drop functionality
- **[FFmpeg](https://ffmpeg.org/)** - Multimedia processing engine

## 📝 Supported Formats

### Input Containers
- MKV, MP4, AVI, MOV, WebM, M4V
- MKS (Matroska subtitles), MKA (Matroska audio)

### Subtitles
- ASS, SSA, SRT, SUB, VTT

### Audio
- AAC, AC3, DTS, FLAC, MP3, OGG, WAV, EAC3, Opus

### Output
- MKV (Matroska)

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or pull request.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ using Tauri and Svelte
</p>

