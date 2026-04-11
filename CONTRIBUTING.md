# Contributing to PaunClip

Thank you for your interest in contributing! 🎉

This document contains a complete guide on how to contribute to this project, for both beginners and experienced developers.

## 📋 Table of Contents

- [How Open Source Works](#how-open-source-works)
- [Initial Setup](#initial-setup)
- [Contribution Workflow](#contribution-workflow)
- [Types of Contributions](#types-of-contributions)
- [Code Style Guide](#code-style-guide)
- [Commit Message Convention](#commit-message-convention)
- [Pull Request Process](#pull-request-process)
- [Review Process](#review-process)

---

## 🌟 How Open Source Works

Before starting, understand the basic concepts of open source on GitHub:

### Important Terms

| Term | Explanation |
|------|-------------|
| **Repository (Repo)** | Project folder stored on GitHub |
| **Fork** | Copy of a repo to your own GitHub account |
| **Clone** | Download repo to your local computer |
| **Branch** | Separate "branch" to work on features without affecting main code |
| **Commit** | Save changes with a descriptive message |
| **Push** | Upload changes from local to GitHub |
| **Pull Request (PR)** | Request to merge your changes into the main repo |
| **Merge** | Combine changes from PR into main code |
| **Issue** | Bug report or feature request |

### Contribution Flow (Simplified)

```
1. Fork repo ──▶ 2. Clone locally ──▶ 3. Create new branch
                                              │
                                              ▼
6. Create Pull Request ◀── 5. Push to GitHub ◀── 4. Edit & Commit
                                              
7. Review & Discussion ──▶ 8. Merge! 🎉
```

---

## 🛠️ Initial Setup

### 1. Install Git

**Windows:**
```powershell
# Using winget
winget install Git.Git

# Or download from https://git-scm.com/download/win
```

**macOS:**
```bash
brew install git
```

**Linux:**
```bash
sudo apt install git
```

### 2. Configure Git

```bash
# Set name and email (will appear in commits)
git config --global user.name "Your Name"
git config --global user.email "email@example.com"

# Verify
git config --list
```

### 3. Create GitHub Account

1. Go to [github.com](https://github.com)
2. Click "Sign up"
3. Follow the registration process

### 4. Setup SSH Key (Recommended)

SSH key allows push/pull without repeated password input.

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "email@example.com"

# Press Enter for all prompts (use defaults)

# Copy SSH key
# Windows:
type %USERPROFILE%\.ssh\id_ed25519.pub | clip

# macOS:
pbcopy < ~/.ssh/id_ed25519.pub

# Linux:
cat ~/.ssh/id_ed25519.pub
```

Then add to GitHub:
1. Go to GitHub → Settings → SSH and GPG keys
2. Click "New SSH key"
3. Paste key and save

---

## 🔄 Contribution Workflow

### Step 1: Fork Repository

1. Go to repo page: `https://github.com/paundrapf/PaunClip`
2. Click the **"Fork"** button in the top right
3. Select your account as destination
4. Wait for fork process to complete

Now you have a copy at `https://github.com/YOUR-USERNAME/PaunClip`

### Step 2: Clone to Local Computer

```bash
# Clone YOUR fork (not the original repo!)
git clone https://github.com/YOUR-USERNAME/PaunClip.git

# Enter project folder
cd PaunClip

# Add "upstream" remote (original repo)
git remote add upstream https://github.com/paundrapf/PaunClip.git

# Verify remotes
git remote -v
# Output:
# origin    https://github.com/YOUR-USERNAME/PaunClip.git (fetch)
# origin    https://github.com/YOUR-USERNAME/PaunClip.git (push)
# upstream  https://github.com/paundrapf/PaunClip.git (fetch)
# upstream  https://github.com/paundrapf/PaunClip.git (push)
```

### Step 3: Sync with Upstream (Important!)

Before starting work, make sure your code is up-to-date:

```bash
# Fetch latest updates from original repo
git fetch upstream

# Switch to main branch
git checkout main

# Merge updates to local
git merge upstream/main

# Push to your fork
git push origin main
```

### Step 4: Create New Branch

**DON'T edit directly on `main` branch!** Always create a new branch.

```bash
# Format: type/short-description
git checkout -b feature/auto-translate-caption
# or
git checkout -b fix/face-detection-error
# or
git checkout -b docs/update-readme
```

### Step 5: Make Changes

Edit files as needed using your favorite editor.

```bash
# Check change status
git status

# View change details
git diff
```

### Step 6: Commit Changes

```bash
# Add changed files to staging
git add filename.py
# or add all files
git add .

# Commit with descriptive message
git commit -m "feat: add auto-translate for captions"
```

### Step 7: Push to GitHub

```bash
# Push branch to your fork
git push origin feature/auto-translate-caption
```

### Step 8: Create Pull Request

1. Open your fork repo on GitHub
2. A banner "Compare & pull request" will appear - click it
3. Or click "Pull requests" tab → "New pull request"
4. Make sure:
   - **base repository**: original repo
   - **base**: main
   - **head repository**: your fork
   - **compare**: your branch
5. Fill in PR title and description
6. Click "Create pull request"

### Step 9: Respond to Review

Maintainers may provide feedback. To update PR:

```bash
# Make changes according to feedback
git add .
git commit -m "fix: address review feedback"
git push origin feature/auto-translate-caption
```

PR will automatically update.

---

## 📝 Types of Contributions

### 🐛 Reporting Bugs

1. Open **Issues** tab in repo
2. Click **"New issue"**
3. Select "Bug Report" template
4. Fill in details:
   - Bug description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots/logs if available
   - Environment (OS, Python version, etc.)

### 💡 Feature Requests

1. Open **Issues** tab
2. Click **"New issue"**
3. Select "Feature Request" template
4. Explain:
   - Desired feature
   - Use case / reason
   - Implementation example (if you have ideas)

### 📖 Improve Documentation

- Fix typos
- Add usage examples
- Translate to other languages
- Add screenshots/diagrams

### 🔧 Code Contribution

- Fix bugs
- Implement new features
- Improve performance
- Refactor code
- Add tests

---

## 🎨 Code Style Guide

### Python Style

Follow [PEP 8](https://pep8.org/) with some additions:

```python
# ✅ Good
def process_video(input_path: str, output_path: str = None) -> bool:
    """
    Process video and return success status.
    
    Args:
        input_path: Path to input video file
        output_path: Path to output file (optional)
    
    Returns:
        True if successful, False otherwise
    """
    if output_path is None:
        output_path = generate_output_path(input_path)
    
    # Process video
    result = do_processing(input_path, output_path)
    
    return result.success


# ❌ Bad
def process_video(input_path,output_path=None):
    if output_path==None:
        output_path=generate_output_path(input_path)
    result=do_processing(input_path,output_path)
    return result.success
```

### Naming Convention

```python
# Variables & functions: snake_case
video_path = "path/to/video.mp4"
def process_video():
    pass

# Classes: PascalCase
class SpeakerTracker:
    pass

# Constants: UPPER_SNAKE_CASE
MAX_CLIP_DURATION = 120
DEFAULT_OUTPUT_DIR = "output"
```

### Import Order

```python
# 1. Standard library
import os
import sys
import json

# 2. Third-party packages
import cv2
import numpy as np
from openai import OpenAI

# 3. Local imports
from highlight_finder import find_highlights
from video_clipper import clip_video
```

---

## 📨 Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <description>

[optional body]

[optional footer]
```

### Types

| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Formatting, no logic changes |
| `refactor` | Code refactor without behavior change |
| `perf` | Performance improvement |
| `test` | Adding/fixing tests |
| `chore` | Maintenance tasks |

### Examples

```bash
# New feature
git commit -m "feat: add support for English subtitles"

# Bug fix
git commit -m "fix: resolve face detection crash on low-res videos"

# Documentation
git commit -m "docs: add installation guide for Ubuntu"

# With body for detailed explanation
git commit -m "feat: implement multi-speaker detection

- Add support for detecting up to 4 speakers
- Improve switching algorithm
- Add configuration options for sensitivity

Closes #42"
```

---

## 🔍 Pull Request Process

### PR Title Format

```
<type>: <short description>
```

Examples:
- `feat: add auto-translate for captions`
- `fix: resolve memory leak in portrait converter`
- `docs: improve installation instructions`

### PR Description Template

```markdown
## Description
Explain the changes you made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## How Has This Been Tested?
Explain how you tested these changes.

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated (if needed)
- [ ] No new warnings generated

## Screenshots (if applicable)
Add screenshots if there are UI/output changes.

## Related Issues
Closes #(issue number)
```

---

## ✅ Review Process

After PR is created:

1. **Automated Checks** - CI/CD will run (if configured)
2. **Maintainer Review** - Maintainer will review code
3. **Feedback** - There may be change requests
4. **Approval** - After approval, PR will be merged
5. **Celebration** - Your contribution is in! 🎉

### Tips for Quick Review

- Small PRs are reviewed faster than large PRs
- One PR = one feature/fix
- Write clear descriptions
- Respond to feedback quickly

---

## ❓ Need Help?

- Open an **Issue** with `question` label
- Discuss in **Discussions** tab (if enabled)
- Mention maintainer in PR/Issue

---

## 🙏 Code of Conduct

- Be respectful and inclusive
- Constructive feedback only
- Help others learn
- No harassment or discrimination

---

Thank you for contributing! Every contribution, no matter how small, is greatly appreciated. 💪
