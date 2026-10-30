import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Html } from '@react-three/drei';
import * as THREE from 'three';

// --- Generic rocky planet surface shader ---
const planetVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader with noise-based surface details
function buildPlanetFrag(baseColor, detailColor, highlightColor, craters) {
  return /* glsl */ `
    varying vec2 vUv;
    varying vec3 vPosition;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = vUv;
      float n = fbm(uv * 8.0);

      // Crater-like dark spots
      ${craters ? `
      float crater = 0.0;
      for (int i = 0; i < 8; i++) {
        vec2 cp = vec2(hash(vec2(float(i), 0.0)), hash(vec2(float(i), 1.0)));
        float d = length(uv - cp);
        float r = 0.03 + hash(vec2(float(i), 2.0)) * 0.08;
        crater += smoothstep(r, r * 0.3, d) * (0.4 + hash(vec2(float(i), 3.0)) * 0.6);
      }
      n = mix(n, n - 0.4, crater * 0.5);
      ` : ''}

      vec3 color = mix(${baseColor}, ${detailColor}, n);
      color = mix(color, ${highlightColor}, n * n * 0.4);

      gl_FragColor = vec4(color, 1.0);
    }
  `;
}

// --- Atmosphere glow ---
const atmoVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmoFrag = (color) => /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform vec3 uViewPos;
  void main() {
    vec3 viewDir = normalize(uViewPos - vPosition);
    float f = 1.0 - abs(dot(viewDir, vNormal));
    f = pow(f, 3.5);
    gl_FragColor = vec4(${color}, f * 0.5);
  }
`;

// --- Orbit ring ---
function OrbitRing({ radius, eccentricity = 0, angle = 0, thickness = 0.015 }) {
  const { geometry } = useMemo(() => {
    const pts = [];
    const tilt = angle * (Math.PI / 180);
    const rotX = new THREE.Matrix4().makeRotationX(tilt);
    const b = radius * Math.sqrt(1 - eccentricity * eccentricity);
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const p = new THREE.Vector3(
        Math.cos(a) * radius,
        0,
        Math.sin(a) * b,
      );
      p.applyMatrix4(rotX);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    return {
      geometry: new THREE.TubeGeometry(curve, 96, thickness, 8, true),
    };
  }, [radius, eccentricity, angle, thickness]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="white" transparent opacity={0.18} />
    </mesh>
  );
}

// --- Main Planet component ---
export default function Planet({
  radius = 0.4,
  orbitRadius = 3,
  orbitSpeed = 1,     // radians per second
  orbitTilt = 0,       // degrees
  startAngle = 0,      // degrees
  eccentricity = 0,    // 0 = perfect circle, 0.2+ = visible ellipse
  baseColor = 'vec3(0.6, 0.6, 0.6)',
  detailColor = 'vec3(0.4, 0.4, 0.4)',
  highlightColor = 'vec3(0.8, 0.8, 0.8)',
  hasCraters = true,
  atmosphereColor = null, // e.g. 'vec3(0.6, 0.8, 1.0)'
  textureUrl = null,      // optional canvas texture dataURL
  label = '',
  labelSize = 12,
  labelColor = 'white',
  onClick = null,
}) {
  const groupRef = useRef();
  const atmoRef = useRef();
  const angleRef = useRef(startAngle * (Math.PI / 180));

  const fragShader = useMemo(
    () => buildPlanetFrag(baseColor, detailColor, highlightColor, hasCraters),
    [baseColor, detailColor, highlightColor, hasCraters],
  );

  const planetTexture = useMemo(() => {
    if (!textureUrl) return null;
    return new THREE.TextureLoader().load(textureUrl);
  }, [textureUrl]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    angleRef.current += delta * orbitSpeed;
    const a = angleRef.current;
    const tilt = orbitTilt * (Math.PI / 180);
    const b = orbitRadius * Math.sqrt(1 - eccentricity * eccentricity);
    const p = new THREE.Vector3(
      Math.cos(a) * orbitRadius,
      0,
      Math.sin(a) * b,
    );
    p.applyMatrix4(new THREE.Matrix4().makeRotationX(tilt));
    groupRef.current.position.copy(p);

    if (atmoRef.current) {
      atmoRef.current.uniforms.uViewPos.value = state.camera.position;
    }
  });

  return (
    <>
      {/* Orbit ring */}
      <OrbitRing radius={orbitRadius} eccentricity={eccentricity} angle={orbitTilt} />

      {/* Planet group */}
      <group ref={groupRef}>
        {/* Surface */}
        <Sphere args={[radius, 48, 48]} onClick={onClick}>
          {planetTexture ? (
            <meshStandardMaterial map={planetTexture} roughness={0.8} metalness={0.05} />
          ) : (
            <shaderMaterial
              vertexShader={planetVertex}
              fragmentShader={fragShader}
            />
          )}
        </Sphere>

        {/* Atmosphere */}
        {atmosphereColor && (
          <Sphere args={[radius * 1.08, 48, 48]}>
            <shaderMaterial
              ref={atmoRef}
              vertexShader={atmoVertex}
              fragmentShader={atmoFrag(atmosphereColor)}
              uniforms={{ uViewPos: { value: new THREE.Vector3() } }}
              transparent
              depthWrite={false}
            />
          </Sphere>
        )}

        {/* Label */}
        <Html position={[0, radius + 0.2, 0]} center>
          <div style={{
            color: labelColor,
            fontSize: labelSize,
            fontWeight: 500,
            textShadow: '0 0 6px rgba(0,0,0,0.7)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            fontFamily: '"Microsoft YaHei", sans-serif',
          }}>
            {label}
          </div>
        </Html>
      </group>
    </>
  );
}

