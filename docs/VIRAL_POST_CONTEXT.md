# Video Copilot - LLM Context for Viral X Post Creation

> Use this document to understand Video Copilot and craft compelling, viral-worthy X (Twitter) posts.

---

## 🎯 One-Line Pitch

**Video Copilot** is an AI-powered video analysis platform that tells creators exactly how to make their videos go viral—with specific, actionable insights from multimodal AI.

---

## 📌 Core Product Summary

### What It Is
A web-based AI platform that analyzes any video (upload or YouTube URL) and provides:
- **Transcription** with speaker diarization and timestamps
- **Retention analysis** predicting where viewers will drop off
- **AI-powered insights** for script, visuals, and pacing improvements
- **SEO optimization** with auto-generated titles, descriptions, tags, and chapters
- **AI thumbnail generation** using HuggingFace FLUX models

### The Problem It Solves
Creating viral video content requires understanding psychology, retention patterns, SEO algorithms, and visual engagement—knowledge that takes years to master. Most creators:
- Don't know WHY viewers leave their videos
- Can't optimize metadata for discoverability
- Lack actionable feedback on script/visuals/pacing
- Spend hours guessing what works

### The Solution
Upload a video → Get an AI "report card" with specific improvements that could boost retention by 10-60%+, complete with copyable SEO metadata and AI-generated thumbnails.

---

## ✨ Key Features (Implemented & Working)

### 1. Video Upload & YouTube Import
- Drag-and-drop file upload (MP4, MOV, AVI, WebM)
- **YouTube URL import** - paste any YouTube link, downloads and analyzes
- Video preview with metadata display

### 2. AI Transcription (Deepgram Nova-2)
- 95%+ accuracy transcription
- Speaker diarization (identifies different speakers)
- Word-level timestamps
- Smart formatting with punctuation and paragraphs

### 3. 8-Category AI Analysis (Gemini Multimodal)
Analyzes videos across 8 knowledge base categories:
| Category | What It Analyzes |
|----------|------------------|
| Core Concepts | Dopamine triggers, pattern interrupts, retention psychology |
| Scripting | Hooks, narrative structure, call-to-actions |
| Visual Editing | Pacing, transitions, kinetic typography |
| Audio Design | Music, sound effects, mixing quality |
| SEO Metadata | Title optimization, description, tags, chapters |
| Style Guides | Creator style consistency |
| Tools & Workflows | Production quality indicators |
| Checklists | Pre-publish quality gates |

### 4. Retention Analysis Dashboard
- **Overall Score** (0-100%) - video's viral potential
- **Suspense detection** - identifies moments that hook viewers
- **Drop-off prediction** - where viewers will likely leave
- **Engagement heatmap** visualization
- **Improvement breakdown** showing contribution of each factor

### 5. Actionable AI Insights
- **Top Priority Actions** - numbered list of most impactful changes
- **Script Suggestions** with expected impact percentages
- **Visual Recommendations** for engagement boosts
- **Pacing Suggestions** with speed multiplier recommendations
- **Improvement Potential Score** with confidence level

### 6. SEO Optimization Suite
- **AI-generated titles** optimized for CTR
- **Descriptions** following YouTube best practices (above-the-fold, mini-blog, timestamps)
- **Tags/Keywords** with one-click copy
- **Auto-generated chapters** for YouTube Key Moments
- **SEO Score** (0-100%) for discoverability rating

### 7. AI Thumbnail Generator (HuggingFace FLUX)
- 4 style options: High Energy, Minimal Tech, Finance, Gaming
- Customizable title text and topic
- Advanced options (guidance scale, inference steps, seed)
- Brand color customization
- History tracking with restore/delete

### 8. Analysis History
- Offline persistence (browser-based SQLite)
- Search and filter past analyses
- Export results as JSON
- Track improvements over time

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui |
| State | Zustand |
| Animations | Framer Motion |
| AI - Transcription | Deepgram Nova-2 |
| AI - Analysis | Google Gemini (gemini-3-flash, gemini-2.5-flash with fallbacks) |
| AI - Thumbnails | HuggingFace FLUX models |
| Database | SQLite (browser-based via better-sqlite3) |
| Audio/Video | FFmpeg, WaveSurfer.js |

---

## 🎯 Target Users

1. **YouTubers** - optimize videos before publishing
2. **TikTokers/Reels creators** - understand short-form retention
3. **Hackathon participants** - create compelling demo videos fast
4. **Course creators** - improve educational content engagement
5. **Marketers** - optimize video ad performance
6. **Indie hackers** - make product demos that convert

---

## 🏆 Unique Differentiators

1. **Knowledge Base-Powered**: Uses curated JSON knowledge bases on retention psychology, scripting techniques, visual editing, and SEO—not generic AI
2. **Multimodal Analysis**: Combines transcript + visual keyframes + audio patterns for comprehensive insights
3. **Actionable over Abstract**: Every insight comes with expected impact % and priority ranking
4. **Free-Tier Friendly**: Sequential API calls with smart retry logic for rate-limited APIs
5. **One-Stop Shop**: Transcription → Analysis → SEO → Thumbnails in single workflow

---

## 📊 Key Metrics & Claims

- **8 AI-powered analysis categories**
- **95%+ transcription accuracy**
- **10-60% predicted retention improvement** from implementing suggestions
- **<3 minutes** for full analysis of 15-min video
- **One-click copy** for all SEO metadata
- **AI thumbnail generation** in 10-30 seconds

---

## 🎬 Hackathon Context

Built for the **Cerebras + Cline Hackathon** in 24 hours. Demonstrates:
- Production-grade AI integration (Deepgram, Gemini, HuggingFace)
- Modern web stack (Next.js 14, TypeScript, Tailwind)
- Sophisticated state management and error handling
- Beautiful, functional UI with dark mode

---

## 💡 Viral Post Angles

### Angle 1: The Problem Hook
"I spent 4 hours editing a video that got 12 views. Then I built an AI that tells me exactly why people clicked away."

### Angle 2: The Tool Reveal
"I built an AI that watches your video and tells you:
- Where viewers will drop off
- What to fix in your script
- The perfect title, description, and tags
- Generates thumbnails automatically

It's like having a viral video expert in your browser."

### Angle 3: The Creator Pain
"Stop guessing why your videos flop.
This AI analyzes retention psychology, hooks, pacing, and SEO—then gives you a numbered list of exactly what to fix."

### Angle 4: The Demo Hook
"Upload a YouTube video. Get back:
✅ Full transcript with timestamps
✅ Retention score + drop-off predictions
✅ AI-written title, description, tags
✅ Generated thumbnails
✅ Specific improvement suggestions

All in under 3 minutes."

### Angle 5: The Hackathon Story
"Built this in 24 hours for a hackathon:
An AI that analyzes your videos across 8 dimensions—script, visuals, audio, SEO, pacing—and tells you exactly how to make them viral.

Thread 🧵"

---

## 🔑 Emotional Triggers for Viral Potential

1. **FOMO**: "This is what top YouTubers know that you don't"
2. **Frustration relief**: "Stop spending hours guessing why videos flop"
3. **Curiosity**: "I fed my worst video to this AI. Here's what it found..."
4. **Aspiration**: "Turn any video into viral content"
5. **Social proof**: "Built with the same AI models used by [notable company]"
6. **Scarcity/Novelty**: "Just built this—never seen anything like it"

---

## 📝 Copyable Elements for Posts

**Tagline Options:**
- "Analyze once, optimize forever"
- "Your AI video coach"
- "Turn uploads into viral hits"
- "The AI that knows why videos go viral"

**Feature Bullets:**
- 🎙️ AI transcription with speaker detection
- 📈 Retention analysis with drop-off prediction
- ✍️ Auto-generated SEO metadata (title, desc, tags)
- 🎨 AI thumbnail generation
- 💡 Actionable insights with impact scores
- ⏱️ YouTube chapter auto-generation
- 📊 8-category comprehensive analysis

**CTA Options:**
- "Try it free: [link]"
- "Drop your YouTube URL and see what you're missing"
- "Your next viral video starts here"

---

## 📸 Visual Assets to Reference

For any accompanying images/videos:
- Dark-mode UI with gradient purple/blue accents
- Retention score circular progress indicator
- Timeline with engagement heatmap
- SEO metadata cards with copy buttons
- Thumbnail generator with style options
- Analysis processing animation with stage indicators

---

*Document generated for LLM context. Use any combination of the above to craft engaging X posts.*
