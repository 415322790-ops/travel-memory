import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { useTravel } from '../context/TravelContext';
import ThreeSun from './ThreeSun';
import Planet from './Planet';

const LABEL = 13;

function Planets() {
  const { setViewMode } = useTravel();

  return (
    <>
      <Planet
        radius={0.07}
        orbitRadius={4.0} eccentricity={0.21}
        orbitSpeed={0.5} orbitTilt={6} startAngle={45}
        baseColor="vec3(0.55, 0.53, 0.50)"
        detailColor="vec3(0.35, 0.33, 0.30)"
        highlightColor="vec3(0.72, 0.70, 0.68)"
        hasCraters={true}
        label="水星" labelSize={LABEL} labelColor="#9e9e9e"
      />

      <Planet
        radius={0.18}
        orbitRadius={6.0} eccentricity={0.01}
        orbitSpeed={0.35} orbitTilt={3} startAngle={200}
        baseColor="vec3(0.80, 0.72, 0.45)"
        detailColor="vec3(0.65, 0.55, 0.30)"
        highlightColor="vec3(0.95, 0.90, 0.70)"
        hasCraters={false}
        atmosphereColor="vec3(1.0, 0.85, 0.55)"
        label="金星" labelSize={LABEL} labelColor="#e8cda0"
      />

      <Planet
        radius={0.19}
        orbitRadius={8.2} eccentricity={0.02}
        orbitSpeed={0.28} orbitTilt={0} startAngle={320}
        baseColor="vec3(0.15, 0.35, 0.65)"
        detailColor="vec3(0.10, 0.25, 0.55)"
        highlightColor="vec3(0.50, 0.75, 0.95)"
        hasCraters={false}
        atmosphereColor="vec3(0.5, 0.7, 1.0)"
        label="地球" labelSize={LABEL} labelColor="#88bbee"
        onClick={() => setViewMode('earth')}
      />

      <Planet
        radius={0.12}
        orbitRadius={10.5} eccentricity={0.09}
        orbitSpeed={0.22} orbitTilt={2} startAngle={100}
        baseColor="vec3(0.70, 0.20, 0.05)"
        detailColor="vec3(0.50, 0.10, 0.02)"
        highlightColor="vec3(0.85, 0.35, 0.15)"
        hasCraters={true}
        atmosphereColor="vec3(0.8, 0.35, 0.1)"
        label="火星" labelSize={LABEL} labelColor="#c1440e"
      />

      <Planet
        radius={0.55}
        orbitRadius={14} eccentricity={0.05}
        orbitSpeed={0.14} orbitTilt={1} startAngle={260}
        baseColor="vec3(0.75, 0.60, 0.35)"
        detailColor="vec3(0.55, 0.40, 0.20)"
        highlightColor="vec3(0.90, 0.78, 0.55)"
        hasCraters={false}
        label="木星" labelSize={LABEL} labelColor="#c9a87c"
      />

      <Planet
        radius={0.48}
        orbitRadius={18} eccentricity={0.06}
        orbitSpeed={0.10} orbitTilt={5} startAngle={140}
        baseColor="vec3(0.82, 0.72, 0.40)"
        detailColor="vec3(0.65, 0.55, 0.28)"
        highlightColor="vec3(0.95, 0.88, 0.62)"
        hasCraters={false}
        label="土星" labelSize={LABEL} labelColor="#e0c878"
      />

      <Planet
        radius={0.28}
        orbitRadius={22} eccentricity={0.05}
        orbitSpeed={0.07} orbitTilt={8} startAngle={30}
        baseColor="vec3(0.30, 0.62, 0.68)"
        detailColor="vec3(0.18, 0.48, 0.55)"
        highlightColor="vec3(0.55, 0.80, 0.85)"
        hasCraters={false}
        atmosphereColor="vec3(0.55, 0.78, 0.82)"
        label="天王星" labelSize={LABEL} labelColor="#7ec8d0"
      />

      <Planet
        radius={0.26}
        orbitRadius={25.5} eccentricity={0.01}
        orbitSpeed={0.055} orbitTilt={6} startAngle={310}
        baseColor="vec3(0.15, 0.22, 0.70)"
        detailColor="vec3(0.08, 0.12, 0.50)"
        highlightColor="vec3(0.40, 0.50, 0.90)"
        hasCraters={false}
        atmosphereColor="vec3(0.35, 0.45, 0.85)"
        label="海王星" labelSize={LABEL} labelColor="#3f54ba"
      />
    </>
  );
}

export default function SolarScene() {
  return (
    <Canvas
      camera={{ position: [0, 3, 10], fov: 45 }}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
      gl={{ toneMapping: 3, toneMappingExposure: 1.2 }}
    >
      <color attach="background" args={['#020008']} />
      <ambientLight intensity={0.1} />
      <Stars radius={50} depth={20} count={1200} factor={5} saturation={0} fade speed={0.3} />

      <ThreeSun />
      <Planets />

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={80}
        autoRotate
        autoRotateSpeed={0.2}
        enablePan={false}
      />
    </Canvas>
  );
}
