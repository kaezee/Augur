# Re-export the gallery frames at 2x: python3 export.py  (needs: pip install playwright && playwright install chromium)
import os
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = {1: "gallery-1-light.png", 2: "gallery-2-dark.png", 3: "gallery-3-custom-button.png"}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 900}, device_scale_factor=2)
    pg.goto("file://" + os.path.join(HERE, "gallery.html"), wait_until="networkidle")
    pg.wait_for_function("window.__ready === true")
    for i, name in NAMES.items():
        pg.locator(f"#frame-{i}").screenshot(path=os.path.join(HERE, name))
    b.close()
