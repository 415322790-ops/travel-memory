import { Component, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { Shape } from 'three';

const CLOUD_LAYERS = [
  { position: [-4.2, 1.7, 0], scale: 2.2, depth: 0.95, drift: [-1.4, 0.3] },
  { position: [4.3, 1.8, -1], scale: 1.55, depth: 0.76, drift: [1.1, 0.15] },
  { position: [-2.4, -1.2, -2], scale: 0.95, depth: 0.56, drift: [-0.7, -0.2] },
  { position: [2.6, -1.1, -3], scale: 0.72, depth: 0.42, drift: [0.55, -0.1] },
  { position: [-0.7, 2.5, -4], scale: 0.42, depth: 0.28, drift: [-0.25, 0.12] },
  { position: [0.5, -2.1, -4.8], scale: 0.48, depth: 0.24, drift: [0.2, -0.1] },
];

const CLOUD_SHAPE = (() => {
  const shape = new Shape();
  shape.moveTo(-1.48, -0.22);
  shape.bezierCurveTo(-1.58, -0.02, -1.48, 0.28, -1.18, 0.28);
  shape.bezierCurveTo(-1.2, 0.65, -0.89, 0.94, -0.54, 0.86);
  shape.bezierCurveTo(-0.34, 1.15, 0.12, 1.24, 0.38, 0.86);
  shape.bezierCurveTo(0.68, 1.04, 1.12, 0.92, 1.2, 0.58);
  shape.bezierCurveTo(1.52, 0.59, 1.7, 0.34, 1.58, 0.12);
  shape.bezierCurveTo(1.76, 0.14, 1.86, -0.08, 1.72, -0.25);
  shape.bezierCurveTo(1.62, -0.42, 1.39, -0.45, 1.2, -0.34);
  shape.bezierCurveTo(0.96, -0.56, 0.55, -0.56, 0.3, -0.39);
  shape.bezierCurveTo(0.08, -0.61, -0.34, -0.62, -0.55, -0.4);
  shape.bezierCurveTo(-0.82, -0.55, -1.15, -0.48, -1.25, -0.27);
  shape.bezierCurveTo(-1.36, -0.34, -1.46, -0.31, -1.48, -0.22);
  shape.closePath();
  return shape;
})();

const CLOUD_OUTLINE_POINTS = [
  [-1.48, -0.22, 0.02], [-1.55, 0.01, 0.02], [-1.44, 0.25, 0.02], [-1.18, 0.28, 0.02],
  [-1.2, 0.64, 0.02], [-0.89, 0.92, 0.02], [-0.54, 0.86, 0.02], [-0.34, 1.15, 0.02],
  [0.12, 1.24, 0.02], [0.38, 0.86, 0.02], [0.68, 1.04, 0.02], [1.12, 0.92, 0.02],
  [1.2, 0.58, 0.02], [1.52, 0.59, 0.02], [1.7, 0.34, 0.02], [1.58, 0.12, 0.02],
  [1.76, 0.14, 0.02], [1.86, -0.08, 0.02], [1.72, -0.25, 0.02], [1.62, -0.42, 0.02],
  [1.39, -0.45, 0.02], [1.2, -0.34, 0.02], [0.96, -0.56, 0.02], [0.55, -0.56, 0.02],
  [0.3, -0.39, 0.02], [0.08, -0.61, 0.02], [-0.34, -0.62, 0.02], [-0.55, -0.4, 0.02],
  [-0.82, -0.55, 0.02], [-1.15, -0.48, 0.02], [-1.25, -0.27, 0.02], [-1.36, -0.34, 0.02],
  [-1.46, -0.31, 0.02], [-1.48, -0.22, 0.02],
];

const CLOUD_PENCIL_LINES = [
  [[-1.25, 0.12, 0.025], [-1.22, 0.35, 0.025], [-1.14, 0.55, 0.025], [-1.03, 0.68, 0.025]],
  [[-0.91, 0.28, 0.025], [-0.88, 0.53, 0.025], [-0.8, 0.72, 0.025]],
  [[-0.51, 0.29, 0.025], [-0.45, 0.56, 0.025], [-0.32, 0.78, 0.025]],
  [[-0.12, 0.35, 0.025], [-0.08, 0.62, 0.025], [0.02, 0.82, 0.025]],
  [[0.28, 0.3, 0.025], [0.34, 0.53, 0.025], [0.43, 0.72, 0.025]],
  [[0.72, 0.22, 0.025], [0.8, 0.43, 0.025], [0.9, 0.6, 0.025]],
  [[1.1, 0.06, 0.025], [1.18, 0.28, 0.025], [1.24, 0.43, 0.025]],
];

function CloudMesh({ layer, progress, pointer }) {
  const group = useRef(null);

  useFrame(() => {
    if (!group.current) return;
    const travel = progress * (4.2 + layer.depth * 4.6);
    const x = layer.position[0] + progress * layer.drift[0] + pointer.x * layer.depth * 0.32;
    const y = layer.position[1] + progress * layer.drift[1] + pointer.y * layer.depth * 0.24;
    const z = layer.position[2] - travel;
    const scale = layer.scale * (1 + progress * layer.depth * 0.62);
    group.current.position.set(x, y, z);
    group.current.scale.setScalar(scale);
    group.current.rotation.z = (pointer.x * layer.depth * 0.045) + layer.position[2] * 0.008;
  });

  return (
    <group ref={group}>
      <mesh>
        <shapeGeometry args={[CLOUD_SHAPE]} />
        <meshBasicMaterial color="#f7f7f5" transparent opacity={0.88} depthWrite={false} />
      </mesh>
      <Line points={CLOUD_OUTLINE_POINTS} color="#777a75" lineWidth={0.65} transparent opacity={0.72} />
      {CLOUD_PENCIL_LINES.map((points, index) => (
        <Line key={index} points={points} color="#92958f" lineWidth={0.42} transparent opacity={0.42} />
      ))}
    </group>
  );
}

function RidgeMesh({ progress, pointer }) {
  const group = useRef(null);

  useFrame(() => {
    if (!group.current) return;
    group.current.position.x = pointer.x * 0.06 - progress * 0.28;
    group.current.position.y = pointer.y * 0.04 + progress * 0.04;
    group.current.position.z = -5.8 - progress * 2.6;
    group.current.scale.setScalar(1 + progress * 0.16);
  });

  return (
    <group ref={group} position={[0, 0, -5.8]}>
      <mesh rotation={[0, 0, 0.04]} position={[-2.6, -1.15, 0]}>
        <coneGeometry args={[2.3, 2.1, 5]} />
        <meshBasicMaterial color="#e5e7e3" transparent opacity={0.42} wireframe />
      </mesh>
      <mesh rotation={[0, 0, -0.04]} position={[2.4, -1.16, -0.3]}>
        <coneGeometry args={[2.5, 2.25, 5]} />
        <meshBasicMaterial color="#e5e7e3" transparent opacity={0.36} wireframe />
      </mesh>
    </group>
  );
}

function JourneyCamera({ progress, pointer, reducedMotion }) {
  useFrame((state) => {
    const camera = state.camera;
    const time = state.clock.getElapsedTime();
    const idleSwayX = reducedMotion ? 0 : Math.sin(time * 0.82) * 0.34;
    const idleSwayY = reducedMotion ? 0 : Math.sin(time * 0.56 + 0.8) * 0.08;
    const targetZ = 8 - progress * 7.2;
    const follow = reducedMotion ? 1 : 0.08;
    camera.position.x += (pointer.x * 0.32 + idleSwayX - camera.position.x) * follow;
    camera.position.y += (-pointer.y * 0.24 + idleSwayY - camera.position.y) * follow;
    camera.position.z += (targetZ - camera.position.z) * follow;
    camera.lookAt(pointer.x * 0.16 + idleSwayX * 0.45, -pointer.y * 0.12 + idleSwayY * 0.35, camera.position.z - 5);
    if (!reducedMotion) camera.rotation.z += (Math.sin(time * 0.72) * 0.012 - camera.rotation.z) * 0.08;
  });

  return null;
}
export class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('[TimeJourney] WebGL background disabled:', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function TimeJourneyScene({ progress, pointer, reducedMotion }) {
  return (
    <Canvas
      className="flight-canvas"
      orthographic
      camera={{ position: [0, 0, 8], zoom: 55, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      fallback={<div aria-hidden="true" />}
    >
      <color attach="background" args={['#fbfbfa']} />
      <JourneyCamera progress={progress} pointer={pointer} reducedMotion={reducedMotion} />
      <RidgeMesh progress={progress} pointer={pointer} />
      {CLOUD_LAYERS.map((layer, index) => <CloudMesh key={index} layer={layer} progress={progress} pointer={pointer} />)}
    </Canvas>
  );
}


