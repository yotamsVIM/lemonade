# Extension Icons

Placeholder icons for the Lemonade EHR Miner extension.

## Required Icons

- `icon16.png` - 16x16 pixels (toolbar icon)
- `icon48.png` - 48x48 pixels (extension management)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## Creating Icons

You can create proper icons using:
1. Design tool (Figma, Sketch, etc.)
2. Online icon generator
3. Image editing software (GIMP, Photoshop, etc.)

### Recommended Design

- Theme: Lemon 🍋 with medical/data theme
- Colors: Yellow/Green gradient (#FFD93D to #6BCF7F)
- Style: Modern, flat design
- Include subtle medical cross or data symbols

### Temporary Workaround

For development, you can use any PNG files with the correct dimensions. Place them in this directory with the names:
- icon16.png
- icon48.png
- icon128.png

Or generate placeholder icons using ImageMagick:

```bash
# Install ImageMagick if not available
apt-get install imagemagick

# Generate placeholder icons
convert -size 16x16 xc:yellow -pointsize 12 -gravity center -annotate +0+0 "🍋" icon16.png
convert -size 48x48 xc:yellow -pointsize 36 -gravity center -annotate +0+0 "🍋" icon48.png
convert -size 128x128 xc:yellow -pointsize 96 -gravity center -annotate +0+0 "🍋" icon128.png
```
