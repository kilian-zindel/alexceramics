import os
import json
from PIL import Image

SOURCE_DIR = "../Images"
OUTPUT_DIR = "../../assets"
MAP_FILE = "image_map.json"
QUALITY_STANDARD = 75
QUALITY_HERO = 85  # higher quality for zooming in on fine-grained details

# thumbnail is 800px to look sharp on 400px 2x/3x high-density screens
SIZES = {
    "thumbnail": 800,
    "display": 1200,
    "hero": 2560
}

VALID_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp')

def setup_directories():
    for size_name in SIZES.keys():
        path = os.path.join(OUTPUT_DIR, size_name)
        os.makedirs(path, exist_ok=True)
    print(f"Created asset directories inside './{OUTPUT_DIR}/'")

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

    image_map = {}

    for index, filename in enumerate(files, start=1):
        source_path = os.path.join(SOURCE_DIR, filename)
        new_base_name = f"Untitled_{index:02d}.webp"
        image_map[filename] = new_base_name

        try:
            with Image.open(source_path) as img:
                icc_profile = img.info.get("icc_profile")

                # convert RGBA (PNGs) to RGB so it saves cleanly to WebP
                if img.mode in ('RGBA', 'LA'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[-1])
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                orig_width, orig_height = img.size

                for size_name, target_width in SIZES.items():
                    target_path = os.path.join(OUTPUT_DIR, size_name, new_base_name)

                    # only resize down; don't upscale if original is smaller than target
                    if orig_width > target_width:
                        target_height = int((target_width / float(orig_width)) * float(orig_height))
                        resized_img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
                    else:
                        resized_img = img

                    q = QUALITY_HERO if size_name == "hero" else QUALITY_STANDARD

                    resized_img.save(
                        target_path,
                        "WEBP",
                        quality=q,
                        optimize=True,
                        icc_profile=icc_profile,
                        subsampling=0  # prevents chroma subsampling color loss
                    )

                print(f"  Processed [{filename}] -> {new_base_name}")

        except Exception as e:
            print(f"  Failed to process {filename}: {e}")

    try:
        with open(MAP_FILE, 'w', encoding='utf-8') as f:
            json.dump(image_map, f, indent=4)
        print(f"\nGenerated filename map: './{MAP_FILE}'")
    except Exception as e:
        print(f"  Failed to save image map JSON: {e}")

    print("\nAll images optimized, structured, and mapped.")

if __name__ == "__main__":
    setup_directories()
    process_images()