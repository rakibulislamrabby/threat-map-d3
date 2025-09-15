'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as d3 from 'd3';
import threatData from '../data/threatData.json';
import countryCoordinates from '../data/countryCoordinates.json';

interface CountryCoordinate {
  name: string;
  lat: number;
  lng: number;
}

interface ThreatData {
  attacks: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    severity: string;
    description: string;
  }>;
  severityLevels: {
    [key: string]: {
      color: string;
      strokeWidth: number;
    };
  };
}

const ThreeJSArcs: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const mountElement = mountRef.current; // Copy ref value to avoid warning
    const width = 1100;
    const height = 750;

    // Create Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Dark background like the image
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    mountElement.appendChild(renderer.domElement);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Create 3D curved arcs
    create3DArcs(scene);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      // Rotate the scene slightly for dynamic effect
      scene.rotation.y += 0.001;
      
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      const newWidth = mountElement?.clientWidth || width;
      const newHeight = mountElement?.clientHeight || height;
      
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (mountElement && renderer.domElement) {
        mountElement.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create3DArcs = (scene: THREE.Scene) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const threats = threatData as ThreatData;

    // Create attack nodes (glowing spheres)
    const attackNodes: THREE.Mesh[] = [];
    const nodePositions = new Map<string, THREE.Vector3>();

    // Collect unique attack locations
    const attackLocations = new Set<string>();
    threats.attacks.forEach(attack => {
      attackLocations.add(attack.source);
      attackLocations.add(attack.target);
    });

    // Create 3D nodes for each location
    attackLocations.forEach(countryId => {
      const coord = coordinates[countryId];
      if (coord) {
        // Convert lat/lng to 3D position on sphere
        const phi = (90 - coord.lat) * (Math.PI / 180);
        const theta = (coord.lng + 180) * (Math.PI / 180);
        const radius = 2;

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);

        const position = new THREE.Vector3(x, y, z);
        nodePositions.set(countryId, position);

        // Create glowing sphere
        const geometry = new THREE.SphereGeometry(0.05, 16, 16);
        const material = new THREE.MeshBasicMaterial({
          color: 0xff6600
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(position);
        scene.add(sphere);
        attackNodes.push(sphere);

        // Add pulsing animation
        animateNodePulse(sphere);
      }
    });

    // Create 3D curved arcs
    threats.attacks.forEach((attack, index) => {
      const sourcePos = nodePositions.get(attack.source);
      const targetPos = nodePositions.get(attack.target);

      if (sourcePos && targetPos) {
        const severity = threats.severityLevels[attack.severity];
        create3DCurvedArc(scene, sourcePos, targetPos, severity.color, index);
      }
    });
  };

  const create3DCurvedArc = (
    scene: THREE.Scene, 
    start: THREE.Vector3, 
    end: THREE.Vector3, 
    color: string, 
    index: number
  ) => {
    // Create curved path using quadratic bezier
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    // Calculate arc height based on distance
    const distance = start.distanceTo(end);
    const arcHeight = Math.min(distance * 0.8, 1.5);
    
    // Create control point for the curve
    const controlPoint = new THREE.Vector3(
      midPoint.x,
      midPoint.y + arcHeight,
      midPoint.z
    );

    // Create curve geometry
    const curve = new THREE.QuadraticBezierCurve3(start, controlPoint, end);
    const points = curve.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    // Create material with glow effect
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.8,
      linewidth: 3
    });

    const line = new THREE.Line(geometry, material);
    scene.add(line);

    // Add flowing animation
    animateArcFlow(line, points, color, index);

    // Add particles along the arc
    createArcParticles(scene, points, color, index);
  };

  const animateArcFlow = (
    line: THREE.Line, 
    points: THREE.Vector3[], 
    color: string, 
    index: number
  ) => {
    const material = line.material as THREE.LineBasicMaterial;
    let time = 0;

    const animate = () => {
      time += 0.01;
      
      // Create flowing effect by modifying opacity
      const flow = Math.sin(time + index * 0.5) * 0.3 + 0.7;
      material.opacity = flow;
      
      // Add slight color variation
      const hue = (parseInt(color.replace('#', ''), 16) + Math.sin(time) * 0x1000) % 0xffffff;
      material.color.setHex(hue);
      
      requestAnimationFrame(animate);
    };
    
    animate();
  };

  const createArcParticles = (
    scene: THREE.Scene, 
    points: THREE.Vector3[], 
    color: string, 
    index: number
  ) => {
    const particleCount = 3;
    const particles: THREE.Mesh[] = [];

    for (let i = 0; i < particleCount; i++) {
      const geometry = new THREE.SphereGeometry(0.02, 8, 8);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color)
      });

      const particle = new THREE.Mesh(geometry, material);
      scene.add(particle);
      particles.push(particle);
    }

    // Animate particles along the arc
    animateParticlesAlongArc(particles, points, index);
  };

  const animateParticlesAlongArc = (
    particles: THREE.Mesh[], 
    points: THREE.Vector3[], 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    index: number
  ) => {
    let time = 0;

    const animate = () => {
      time += 0.005;

      particles.forEach((particle, i) => {
        const offset = (i / particles.length) * Math.PI * 2;
        const progress = (Math.sin(time + offset) + 1) / 2;
        
        const pointIndex = Math.floor(progress * (points.length - 1));
        const point = points[pointIndex];
        
        if (point) {
          particle.position.copy(point);
          
          // Add slight pulsing
          const scale = 1 + Math.sin(time * 2 + offset) * 0.3;
          particle.scale.setScalar(scale);
        }
      });

      requestAnimationFrame(animate);
    };

    animate();
  };

  const animateNodePulse = (node: THREE.Mesh) => {
    const originalScale = node.scale.clone();
    let time = 0;

    const animate = () => {
      time += 0.02;
      const pulse = 1 + Math.sin(time) * 0.3;
      node.scale.copy(originalScale).multiplyScalar(pulse);
      requestAnimationFrame(animate);
    };

    animate();
  };

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      position: 'relative',
      overflow: 'hidden',
      background: '#000000'
    }}>
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
};

export default ThreeJSArcs;
