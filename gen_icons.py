#!/usr/bin/env python3
"""Generate LKC Accounting app icons"""

import struct, zlib, math

def create_png(size):
    """Create a simple PNG icon programmatically"""
    
    def png_chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)
    
    # Colors
    bg = (10, 22, 40)       # Dark navy
    accent = (42, 141, 255)  # Blue
    
    # Create pixel data
    pixels = []
    center = size // 2
    
    for y in range(size):
        row = []
        for x in range(size):
            dx = x - center
            dy = y - center
            dist = math.sqrt(dx*dx + dy*dy)
            
            # Rounded rectangle background
            corner_r = size * 0.18
            rx = abs(dx) - (center - corner_r - 1)
            ry = abs(dy) - (center - corner_r - 1)
            
            in_rect = False
            if abs(dx) <= center - 1 and abs(dy) <= center - 1:
                if rx <= 0 or ry <= 0 or math.sqrt(max(0,rx)**2 + max(0,ry)**2) <= corner_r:
                    in_rect = True
            
            if not in_rect:
                row.extend([0, 0, 0, 0])  # Transparent
                continue
            
            # Draw "LKC" text area as stylized mark
            # Blue accent bar at top
            if y < size * 0.12:
                row.extend([accent[0], accent[1], accent[2], 255])
            else:
                # Dark background
                row.extend([bg[0], bg[1], bg[2], 255])
        
        pixels.append(bytes([0] + row))  # Filter byte
    
    # PNG header
    header = b'\x89PNG\r\n\x1a\n'
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    ihdr = png_chunk(b'IHDR', ihdr_data)
    
    # IDAT
    raw = b''.join(pixels)
    compressed = zlib.compress(raw, 9)
    idat = png_chunk(b'IDAT', compressed)
    
    # IEND
    iend = png_chunk(b'IEND', b'')
    
    return header + ihdr + idat + iend

# Generate both sizes
for size, name in [(192, 'icon-192.png'), (512, 'icon-512.png')]:
    png_data = create_png(size)
    with open(name, 'wb') as f:
        f.write(png_data)
    print(f"Created {name}")
