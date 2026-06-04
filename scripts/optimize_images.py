import os
import json
from PIL import Image

# Configuration
SOURCE_DIR = "../Images"
OUTPUT_DIR = "../assets"
MAP_FILE = "image_map.json"
QUALITY_STANDARD = 75
QUALITY_HERO = 85  # Higher quality for zooming in on fine-grained details

# Target widths
# Thumbnail is 800px to look sharp on 400px 2x/3x high-density screens
SIZES = {
    "thumbnail": 800,   
    "display": 1200,    
    "hero": 2560        
}

# Supported image formats
VALID_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp')

def setup_directories():
    """Creates the target asset directories if they don't exist."""
    for size_name in SIZES.keys():
        path = os.path.join(OUTPUT_DIR, size_name)
        os.makedirs(path, exist_ok=True)
    print(f"✔ Created asset directories inside './{OUTPUT_DIR}/'")

def process_images():
    if not os.path.exists(SOURCE_DIR):
        print(f"Error: Source directory '{SOURCE_DIR}' not found.")
        return

    # Gather and sort files to keep renaming sequence predictable
    files = [f for f in os.listdir(SOURCE_DIR) if f.lower().endswith(VALID_EXTENSIONS)]
    files.sort()

    if not files:
        print(f"No valid images found in './{SOURCE_DIR}/'")
        return

    print(f"Found {len(files)} images. Starting processing...")

    # Dictionary to store the mapping between old and new names
    image_map = {}

    for index, filename in enumerate(files, start=1):
        source_path = os.path.join(SOURCE_DIR, filename)
        new_base_name = f"Untitled_{index:02d}.webp"
        
        # Save the relationship in our map
        image_map[filename] = new_base_name
        
        try:
            with Image.open(source_path) as img:
                # Extract original ICC color profile to preserve color space vibrancy
                icc_profile = img.info.get("icc_profile")

                # Convert RGBA (PNGs) to RGB so it saves cleanly to WebP
                if img.mode in ('RGBA', 'LA'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[-1])
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                orig_width, orig_height = img.size

                # Process each target size
                for size_name, target_width in SIZES.items():
                    target_path = os.path.join(OUTPUT_DIR, size_name, new_base_name)
                    
                    # Only resize down; don't upscale if original is smaller than target
                    if orig_width > target_width:
                        # Calculate proportional height
                        target_height = int((target_width / float(orig_width)) * float(orig_height))
                        resized_img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
                    else:
                        resized_img = img

                    # Determine quality setting
                    q = QUALITY_HERO if size_name == "hero" else QUALITY_STANDARD
                    
                    # Save as WebP with full color data and original profile preserved
                    resized_img.save(
                        target_path, 
                        "WEBP", 
                        quality=q, 
                        optimize=True,
                        icc_profile=icc_profile,
                        subsampling=0  # Prevents chroma subsampling color loss
                    )
                
                print(f"  ↳ Processed [{filename}] -> {new_base_name}")

        except Exception as e:
            print(f"  ❌ Failed to process {filename}: {e}")

    # Write the image map to a JSON file
    try:
        with open(MAP_FILE, 'w', encoding='utf-8') as f:
            json.dump(image_map, f, indent=4)
        print(f"\n✔ Successfully generated filename map: './{MAP_FILE}'")
    except Exception as e:
        print(f"  ❌ Failed to save image map JSON: {e}")

    print("\n🎉 All images successfully optimized, structured, and mapped!")

if __name__ == "__main__":
    setup_directories()
    process_images()