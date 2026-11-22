import cv2
import os

SRC = r"C:\Users\Shruti Subramanian\Downloads\Screen Recording 2026-08-06 162711.mp4"
OUT = os.path.join(os.path.dirname(__file__), "frames")
os.makedirs(OUT, exist_ok=True)

cap = cv2.VideoCapture(SRC)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
targets = set(range(0, total, int(fps * 15)))

idx = 0
saved = 0
while True:
    ok = cap.grab()
    if not ok:
        break
    if idx in targets:
        ok, frame = cap.retrieve()
        if ok:
            small = cv2.resize(frame, (960, 540))
            cv2.imwrite(
                os.path.join(OUT, f"t{idx / fps:05.0f}.jpg"),
                small,
                [cv2.IMWRITE_JPEG_QUALITY, 82],
            )
            saved += 1
    idx += 1

print(f"duration={total / fps:.1f}s saved={saved}")
