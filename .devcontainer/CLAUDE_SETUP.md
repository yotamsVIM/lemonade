# Claude Code Setup Instructions

## Automatic Installation

Claude Code CLI is automatically installed when the devcontainer builds via the `postCreateCommand`.

## Configure Your API Tokens

The devcontainer is configured to automatically pull API tokens from your host environment variables.

### Setup on Host Machine (Before Opening DevContainer)

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, or `~/.profile`):

```bash
export ANTHROPIC_API_KEY="your-anthropic-key-here"
export GEMINI_API_KEY="your-gemini-key-here"
```

Then reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

### What Happens on Bootup

When the devcontainer starts, it will automatically:
1. Pull `ANTHROPIC_API_KEY` from your host environment
2. Pull `GEMINI_API_KEY` from your host environment
3. Make them available inside the container

No manual configuration needed inside the container!

## Verify Installation

Inside the devcontainer, check that Claude Code is installed:
```bash
claude-code --version
```

Verify your API tokens are available:
```bash
echo $ANTHROPIC_API_KEY
echo $GEMINI_API_KEY
```

## Usage

Start a Claude Code session:
```bash
claude-code
```

Or run a one-off command:
```bash
claude-code "analyze this codebase"
```

## Security Notes

- API tokens are passed from host environment variables
- Tokens are only accessible inside the sandboxed container
- No filesystem mounting of credentials
- Container has no Docker access or privileged capabilities
- Only the workspace directory is accessible to the AI agent

## Get Your API Keys

### Anthropic (Claude)
1. Go to https://console.anthropic.com/
2. Sign in or create an account
3. Navigate to API Keys section
4. Create a new API key
5. Add to your host shell profile as `ANTHROPIC_API_KEY`

### Google (Gemini)
1. Go to https://makersuite.google.com/app/apikey
2. Sign in with your Google account
3. Create a new API key
4. Add to your host shell profile as `GEMINI_API_KEY`
