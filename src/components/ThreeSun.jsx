import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import * as THREE from 'three';

// Procedural solar surface shader
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;

  // Simple noise
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
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Animated surface
    vec2 uv = vUv;
    float t = uTime * 0.03;

    // Distort UVs with noise
    uv.x += fbm(uv * 6.0 + t) * 0.15;
    uv.y += fbm(uv * 6.0 + t + 1.5) * 0.15;

    float n = fbm(uv * 8.0 + t * 0.5);

    // Color based on noise
    vec3 dark  = vec3(0.8, 0.2, 0.0);  // deep orange
    vec3 mid   = vec3(1.0, 0.55, 0.0);  // orange
    vec3 light = vec3(1.0, 0.85, 0.2);  // bright yellow
    vec3 hot   = vec3(1.0, 1.0, 0.9);   // white-hot

    float t1 = smoothstep(0.2, 0.5, n);
    float t2 = smoothstep(0.5, 0.7, n);
    float t3 = smoothstep(0.7, 1.0, n);

    vec3 color = mix(dark, mid, t1);
    color = mix(color, light, t2);
    color = mix(color, hot, t3);

    // Brighten center slightly
    float fresnel = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
    color = mix(color, hot, fresnel * 0.15);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Corona/glow shader
const glowVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform vec3 uViewPos;
  void main() {
    vec3 viewDir = normalize(uViewPos - vPosition);
    float fresnel = 1.0 - abs(dot(viewDir, vNormal));
    fresnel = pow(fresnel, 2.5);

    vec3 innerGlow = vec3(1.0, 0.5, 0.0);
    vec3 outerGlow = vec3(1.0, 0.2, 0.0);
    vec3 glow = mix(innerGlow, outerGlow, fresnel);

    gl_FragColor = vec4(glow, fresnel * 0.7);
  }
`;

function SunSurface() {
  const shaderRef = useRef();
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 } }),
    [],
  );

  useFrame((_, delta) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value += delta;
    }
  });

  return (
    <Sphere args={[2.0, 64, 64]}>
      <shaderMaterial
        ref={shaderRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </Sphere>
  );
}

function SunGlow() {
  const shaderRef = useRef();

  useFrame((state) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uViewPos.value = state.camera.position;
    }
  });

  return (
    <>
      {/* Inner glow */}
      <Sphere args={[2.25, 48, 48]}>
        <shaderMaterial
          ref={shaderRef}
          vertexShader={glowVertexShader}
          fragmentShader={glowFragmentShader}
          uniforms={{ uViewPos: { value: new THREE.Vector3() } }}
          transparent
          depthWrite={false}
        />
      </Sphere>
      {/* Outer glow */}
      <Sphere args={[2.6, 32, 32]}>
        <shaderMaterial
          vertexShader={glowVertexShader}
          fragmentShader={/* glsl */ `
            varying vec3 vNormal;
            varying vec3 vPosition;
            uniform vec3 uViewPos;
            void main() {
              vec3 viewDir = normalize(uViewPos - vPosition);
              float fresnel = 1.0 - abs(dot(viewDir, vNormal));
              fresnel = pow(fresnel, 4.0);
              gl_FragColor = vec4(1.0, 0.35, 0.05, fresnel * 0.35);
            }
          `}
          uniforms={{ uViewPos: { value: new THREE.Vector3() } }}
          transparent
          depthWrite={false}
        />
      </Sphere>
    </>
  );
}

export default function ThreeSun() {
  return (
    <group>
      <SunSurface />
      <SunGlow />
    </group>
  );
}
