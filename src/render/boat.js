// A small research boat (tagging in the intro, SMART drumline check). Hull below the waterline lives in the water
// scene, the cabin and scientists live in the sky band.
import * as THREE from 'three';
import { makeMaterial } from './materials.js';
import { clipToWaterline } from './skyclip.js';

export class Boat {
  constructor(scene, sky) {
    this.water = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(-5.2, 0); s.lineTo(-5.8, -0.2); s.bezierCurveTo(-4.8, -1.5, -2.5, -1.7, -1, -1.7); s.lineTo(3.8, -1.7); s.bezierCurveTo(5, -1.7, 5.6, -0.8, 6, 0); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2 });
    g.translate(0, 0, -1.3);
    this.hull = new THREE.Mesh(g, makeMaterial({ tint: 0xe4ebee, caustic: 0.4, rim: 0.3 }));
    this.water.add(this.hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.18, 2.9), makeMaterial({ tint: 0x1b5f95 })); stripe.position.set(0.2, -0.45, 0);
    this.water.add(stripe);
    scene.add(this.water);
    // above water
    this.air = new THREE.Group();
    const m = c => clipToWaterline(new THREE.MeshBasicMaterial({ color: c }));
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 0.55), m(0xe9eff1)); deck.position.set(0.2, 0.28, 0);
    const cabin = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.5), m(0xf4f6f6)); cabin.position.set(2.2, 1.3, 0.01);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.5), m(0x203845)); win.position.set(2.2, 1.55, 0.02);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 0.16), m(0x1b5f95)); roof.position.set(2.2, 2.12, 0.02);
    const mast = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.2), m(0x303a40)); mast.position.set(2.6, 2.7, 0);
    const crane = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.2), m(0x303a40)); crane.position.set(-3.6, 1.6, 0); crane.rotation.z = 0.35;
    this.air.add(deck, cabin, win, roof, mast, crane);
    this.people = [];
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 3, 8), m(i ? 0xff7a1a : 0x1b5f95)); body.position.y = 0.55;
      const head = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), m(0xe8b48a)); head.position.y = 1.05;
      p.add(body, head); p.position.set(-1.6 + i * 1.0, 0.45, 0.02); this.air.add(p); this.people.push(p);
    }
    this.air.visible = false; sky.live.add(this.air);
    this.dart = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 3, 8), new THREE.MeshBasicMaterial({ color: 0xff9a1a }));
    this.dart.visible = false; scene.add(this.dart);
    this.water.visible = false;
  }
  place(x, visible, t = 0) {
    this.water.visible = this.air.visible = visible;
    if (!visible) return;
    const bob = Math.sin(t * 1.4) * 0.06;
    this.water.position.set(x, 0.18 + bob, 0); this.water.rotation.z = Math.sin(t * 1.1) * 0.015;
    this.air.position.set(x, 0.18 + bob, 0);
  }
}
