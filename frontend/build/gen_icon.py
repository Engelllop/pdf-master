from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background circle (slate-900)
    margin = size // 16
    draw.ellipse([margin, margin, size - margin, size - margin], fill=(15, 23, 42, 255))
    
    # Document shape (white with rounded corners)
    doc_margin = size // 5
    doc_w = size - doc_margin * 2
    doc_h = int(doc_w * 1.3)
    doc_x = (size - doc_w) // 2
    doc_y = (size - doc_h) // 2
    radius = size // 12
    
    # Draw rounded rectangle for document
    draw.rounded_rectangle([doc_x, doc_y, doc_x + doc_w, doc_y + doc_h], radius=radius, fill=(255, 255, 255, 255))
    
    # Folded corner (subtle blue tint)
    fold_size = size // 6
    draw.polygon([
        (doc_x + doc_w - fold_size, doc_y),
        (doc_x + doc_w, doc_y),
        (doc_x + doc_w, doc_y + fold_size)
    ], fill=(226, 232, 240, 255))
    
    # "P" letter
    try:
        font_size = int(size * 0.35)
        font = ImageFont.truetype("segoeui.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    text = "P"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = doc_x + (doc_w - text_w) // 2
    text_y = doc_y + (doc_h - text_h) // 2 - size // 30
    
    draw.text((text_x, text_y), text, fill=(59, 130, 246, 255), font=font)
    
    # PDF label at bottom
    try:
        label_font = ImageFont.truetype("segoeui.ttf", size // 10)
    except:
        label_font = ImageFont.load_default()
    
    label = "PDF"
    lbbox = draw.textbbox((0, 0), label, font=label_font)
    label_w = lbbox[2] - lbbox[0]
    label_x = doc_x + (doc_w - label_w) // 2
    label_y = doc_y + doc_h - size // 7
    draw.text((label_x, label_y), label, fill=(100, 116, 139, 255), font=label_font)
    
    return img

# Generate multi-resolution ICO
sizes = [256, 128, 64, 48, 32, 16]
images = [create_icon(s) for s in sizes]
images[0].save('icon.ico', format='ICO', sizes=[(s, s) for s in sizes])

# Generate PNG
images[0].save('icon.png', format='PNG')

print("Icons generated successfully!")
