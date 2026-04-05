"""
generate_qr.py — генерация QR-кодов для устройств

Установка:
  pip install qrcode[pil]

Использование:
  python generate_qr.py <device_id> <base_url>

Пример:
  python generate_qr.py d8d7fb86-0a7c-4398-addd-2bc70a6c5a81 https://yoursite.com
"""

import sys
import os

try:
    import qrcode
except ImportError:
    print("Установите библиотеку: pip install qrcode[pil]")
    sys.exit(1)

def generate_qr(device_id, base_url):
    url = f"{base_url.rstrip('/')}/device.html?id={device_id}"
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    filename = f"device_{device_id[:8]}.png"
    img.save(filename)
    
    print(f"✅ QR-код создан: {filename}")
    print(f"🔗 URL: {url}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Использование: python generate_qr.py <device_id> <base_url>")
        print("Пример:        python generate_qr.py d8d7fb86-... https://mysite.com")
        sys.exit(1)
    
    device_id = sys.argv[1]
    base_url = sys.argv[2]
    generate_qr(device_id, base_url)
