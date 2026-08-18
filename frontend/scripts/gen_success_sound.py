"""Generate a short festive success chime (ascending arpeggio) as WAV. Pure stdlib."""
import wave, struct, math, os

SR = 22050
notes = [523.25, 659.25, 783.99, 1046.50]  # C5 E5 G5 C6
note_dur = 0.13
gap = 0.0
amp = 0.42

samples = []
for i, f in enumerate(notes):
    n = int(SR * note_dur)
    for s in range(n):
        t = s / SR
        # exponential decay envelope
        env = math.exp(-6.0 * t)
        # slight vibrato + second harmonic for a bell-like tone
        val = env * (math.sin(2 * math.pi * f * t) + 0.35 * math.sin(2 * math.pi * f * 2 * t))
        samples.append(val)
# little sparkle tail at the top note
n = int(SR * 0.25)
f = notes[-1]
for s in range(n):
    t = s / SR
    env = math.exp(-4.0 * t)
    val = env * (math.sin(2 * math.pi * f * t) + 0.3 * math.sin(2 * math.pi * f * 1.5 * t))
    samples.append(val * 0.8)

# normalize
peak = max(1e-6, max(abs(x) for x in samples))
scale = amp / peak

out_dir = os.path.join(os.path.dirname(__file__), "..", "assets", "sounds")
os.makedirs(out_dir, exist_ok=True)
path = os.path.join(out_dir, "success.wav")
with wave.open(path, "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    frames = b"".join(struct.pack("<h", int(max(-1, min(1, x * scale)) * 32767)) for x in samples)
    w.writeframes(frames)
print("wrote", path, os.path.getsize(path), "bytes")
