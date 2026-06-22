# Credits & Third-Party Assets

## 3D Models

### Cockpit interior — `assets/cockpit.glb`
- **Title**: "Cockpit control center"
- **Author**: Google
- **License**: [Creative Commons Attribution (CC-BY 3.0)](https://creativecommons.org/licenses/by/3.0/)
- **Source**: Icosa Gallery (open Google Poly successor), `https://api.icosa.gallery`
- **Use**: Rendered as the first-person glass flight-deck in the in-cockpit camera view
  (press `V`). The model is anchored at the pilot eye so the camera sits in the seat —
  MFD glass panels below, windshield ahead, overhead switch panel above.

Per the CC-BY license, attribution is also shown in the in-app intro/help modal.

## Libraries

- **Three.js** r128 — MIT License — https://threejs.org (loaded from cdnjs CDN)
- **GLTFLoader / post-processing passes** (EffectComposer, RenderPass, UnrealBloomPass,
  GammaCorrectionShader) — Three.js examples, MIT License (loaded from unpkg `three@0.128.0`)
- **node:test** — Node.js built-in test runner (Node 20+)
