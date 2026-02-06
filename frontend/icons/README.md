# App Icons

This directory should contain PNG icons at the following sizes:

- `icon-72.png` (72x72)
- `icon-96.png` (96x96)
- `icon-128.png` (128x128)
- `icon-144.png` (144x144)
- `icon-152.png` (152x152)
- `icon-192.png` (192x192)
- `icon-384.png` (384x384)
- `icon-512.png` (512x512)
- `badge-72.png` (72x72) - for notification badge, typically monochrome

## Generating Icons

You can use the included `icon.svg` as a source and convert it using:

### Online Tools
- https://realfavicongenerator.net/
- https://maskable.app/editor (for maskable icons)

### Command Line (ImageMagick)

```bash
# Install ImageMagick if needed
# macOS: brew install imagemagick
# Ubuntu: apt install imagemagick

# Generate all sizes from SVG
for size in 72 96 128 144 152 192 384 512; do
  convert -background none -density 512 icon.svg -resize ${size}x${size} icon-${size}.png
done

# Create badge (monochrome version)
convert -background none -density 512 icon.svg -resize 72x72 -colorspace Gray badge-72.png
```

### Design Guidelines

- **Maskable icons**: Leave ~10% padding around the design for maskable icons (used by Android)
- **Badge**: Should be recognizable at small sizes, often monochrome
- **iOS**: Apple prefers no transparency in icons
