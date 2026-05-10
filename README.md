# Haptic 650

A visual previewer and Luau code generator for Roblox's `HapticEffect` instance.

**[Live demo →](https://kaan650.github.io/haptic-650/)**

## Features

- **Waveform editor** — click to add keys, drag to move, right-click to delete; Linear / Cubic / Constant interpolation per key
- **Presets** — Ramp Up, Pulse, Heartbeat, Explosion, Rumble, Click
- **Live Luau output** — syntax-highlighted, lines matching defaults are omitted, copy with one click
- **Test Vibrate** — plays the waveform on three channels at once: connected gamepads (real per-chunk intensity), the device vibration motor (mobile, PWM-simulated intensity), and a low-frequency Web Audio rumble (desktop fallback)
- **Motor Layout panel** — live diagram of Roblox's haptic motor positions (Phone, VR hands, Gamepad small/large); drag the position dot or radius edge to edit, motors inside the radius light up in their own color
- **Share link** — entire editor state is encoded into the URL hash; paste the link and the receiver sees the exact same effect, ready to tweak

## Stack

Plain HTML / CSS / JavaScript — no build step, no dependencies. Open `index.html` and it works.

## Local

```sh
git clone https://github.com/kaan650/haptic-650.git
cd haptic-650
# open index.html in any browser, or serve it:
python -m http.server 8000
```
