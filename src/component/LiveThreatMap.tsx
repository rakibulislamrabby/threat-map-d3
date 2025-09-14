'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import worldData from '../data/world.json';
import countryCoordinates from '../data/countryCoordinates.json';
import threatData from '../data/threatData.json';

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

interface CountryFeature {
  id: string;
  properties: {
    name: string;
  };
}

const LiveThreatMap: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationIdRef = useRef<number | null>(null);
  
  const [activeAttacks, setActiveAttacks] = useState<Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    severity: string;
    description: string;
    startTime: number;
    duration: number;
  }>>([]);

  const width = 1600;
  const height = 1000;

  useEffect(() => {
    if (!svgRef.current || !threeContainerRef.current || !tooltipRef.current) return;

    const svg = d3.select(svgRef.current);
    const tooltip = d3.select(tooltipRef.current);

    // Clear any existing content
    svg.selectAll("*").remove();

    // Set up projection
    const projection = d3.geoMercator()
      .translate([width / 2, height / 2])
      .scale((width - 1) / 2 / Math.PI);

    // Set up zoom behavior (zoom only, no drag/pan)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .filter((event) => {
        return event.type === 'wheel';
      })
      .on("zoom", (event) => {
        const { transform } = event;
        const centerTransform = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(transform.k)
          .translate(-width / 2, -height / 2);
        
        svg.selectAll('.main-group')
          .attr("transform", centerTransform.toString());
      });

    svg.call(zoom);

    // Add overlay rect for zoom/pan
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "none")
      .style("pointer-events", "all");

    // Create path generator
    const path = d3.geoPath().projection(projection);

    // Convert topojson to geojson
    const countries = topojson.feature(worldData as any, worldData.objects.world_subunits as any);

    // Create main transform group for both countries and arcs
    const mainGroup = svg.append("g")
      .attr("class", "main-group");

    // Create countries group inside main group
    const countriesGroup = mainGroup.append("g")
      .attr("class", "countries-group");

    // Add countries - ALL SAME GRAY COLOR with hover border effect
    countriesGroup.selectAll(".subunit")
      .data((countries as any).features)
      .enter()
      .append("path")
      .attr("class", (d) => {
        const feature = d as CountryFeature;
        return `subunit-boundary subunit gray-country ${feature.id}`;
      })
      .style("fill", "#333333") // Dark gray for dark theme
      .style("stroke", "#555555")
      .style("stroke-width", "1px")
      .style("stroke-linejoin", "round")
      .attr("d", path as any)
      .on("mouseover", function(event, d) {
        const feature = d as CountryFeature;

        // Change border color on hover
        d3.select(this)
          .style("stroke", "#6a6e6d")
          .style("stroke-width", "2px");

        // Make all countries more grayish when hovering
        countriesGroup.selectAll(".subunit")
          .style("fill", "#444444"); // More grayish color

        // Show tooltip with country name
        const [mouseX, mouseY] = d3.pointer(event, svgRef.current);

        tooltip
          .style("display", "block")
          .style("left", `${mouseX + 5}px`)
          .style("top", `${mouseY - 25}px`)
          .html(`<p>${feature.properties.name}</p>`);
      })
      .on("mouseout", function() {
        // Reset border color
        d3.select(this)
          .style("stroke", "#555555")
          .style("stroke-width", "1px");

        // Reset all countries to original gray color
        countriesGroup.selectAll(".subunit")
          .style("fill", "#333333"); // Original gray color

        tooltip.style("display", "none");
      });

    // Initialize Three.js scene
    initializeThreeJS();

    // Start live attack simulation
    const cleanupSimulation = startLiveAttackSimulation();

    // Cleanup function
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (cleanupSimulation) {
        cleanupSimulation();
      }
    };
  }, []);

  const createTestArc = () => {
    // Create a simple test arc to verify Three.js is working
    const points = [
      new THREE.Vector3(-2, 0, 0),
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(2, 0, 0)
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 15
    });
    
    return new THREE.Line(geometry, material);
  };

  const initializeThreeJS = () => {
    if (!threeContainerRef.current) return;

    // Create Three.js scene
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background
    sceneRef.current = scene;

    // Add lighting to make arcs visible
    const ambientLight = new THREE.AmbientLight(0x404040, 1.0);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Create camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 0, 6); // Move camera further back
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      transparent: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    threeContainerRef.current.appendChild(renderer.domElement);

    // Add a test arc to make sure Three.js is working
    const testArc = createTestArc();
    if (testArc && sceneRef.current) {
      sceneRef.current.add(testArc);
      console.log('Added test arc to scene. Scene children:', sceneRef.current.children.length);
    } else {
      console.log('Failed to add test arc. Scene:', sceneRef.current, 'TestArc:', testArc);
    }

    // Animation loop
    let frameCount = 0;
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      frameCount++;
      
      // Rotate the scene slightly for dynamic effect
      if (sceneRef.current) {
        sceneRef.current.rotation.y += 0.002;
      }
      
      if (rendererRef.current && cameraRef.current && sceneRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        
        // Log every 60 frames (about once per second)
        if (frameCount % 60 === 0) {
          console.log('Rendering frame', frameCount, 'Scene children:', sceneRef.current.children.length);
        }
      }
    };
    animate();
  };

  const startLiveAttackSimulation = () => {
    const threats = threatData as ThreatData;
    
    // Function to spawn a new attack
    const spawnAttack = () => {
      const randomAttack = threats.attacks[Math.floor(Math.random() * threats.attacks.length)];
      const duration = 3000 + Math.random() * 4000; // 3-7 seconds
      
      const newAttack = {
        ...randomAttack,
        startTime: Date.now(),
        duration: duration
      };

      console.log('Spawning new attack:', newAttack.type, 'from', newAttack.source, 'to', newAttack.target);
      setActiveAttacks(prev => [...prev, newAttack]);

      // Create 3D arc for this attack
      createLive3DArc(newAttack);

      // Remove attack after duration
      setTimeout(() => {
        setActiveAttacks(prev => prev.filter(attack => attack.id !== newAttack.id));
      }, duration);
    };

    // Spawn attacks at random intervals (faster for testing)
    const spawnInterval = setInterval(spawnAttack, 1000 + Math.random() * 2000);

    // Return cleanup function
    return () => clearInterval(spawnInterval);
  };

  const createLive3DArc = (attack: any) => {
    if (!sceneRef.current) return;

    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const threats = threatData as ThreatData;
    
    const sourceCoord = coordinates[attack.source];
    const targetCoord = coordinates[attack.target];

    if (!sourceCoord || !targetCoord) {
      console.log('Missing coordinates for attack:', attack.source, attack.target);
      return;
    }

    // Convert lat/lng to 3D position
    const sourcePos = latLngTo3D(sourceCoord.lat, sourceCoord.lng);
    const targetPos = latLngTo3D(targetCoord.lat, targetCoord.lng);

    const severity = threats.severityLevels[attack.severity];

    console.log('Creating 3D arc from', sourceCoord.name, 'to', targetCoord.name);

    // Create 3D curved arc with higher curve
    const midPoint = new THREE.Vector3().addVectors(sourcePos, targetPos).multiplyScalar(0.5);
    const curveHeight = 3; // Much higher curve
    const controlPoint = midPoint.clone().add(new THREE.Vector3(0, curveHeight, 0));
    
    const curve = new THREE.QuadraticBezierCurve3(sourcePos, controlPoint, targetPos);

    const points = curve.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(severity.color),
      transparent: true,
      opacity: 1.0,
      linewidth: 20 // Very thick for maximum visibility
    });

    const line = new THREE.Line(geometry, material);
    sceneRef.current.add(line);

    console.log('Added arc to scene, total objects:', sceneRef.current.children.length);

    // Add flowing animation
    animateLiveArc(line, attack.duration);

    // Add particles
    createLiveParticles(points, severity.color, attack.duration);

    // Remove arc after duration
    setTimeout(() => {
      if (sceneRef.current) {
        sceneRef.current.remove(line);
        console.log('Removed arc from scene');
      }
    }, attack.duration);
  };

  const latLngTo3D = (lat: number, lng: number) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const radius = 2.5; // Larger radius for better visibility

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    return new THREE.Vector3(x, y, z);
  };

  const animateLiveArc = (line: THREE.Line, duration: number) => {
    const material = line.material as THREE.LineBasicMaterial;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      if (progress < 1) {
        // Flowing effect
        const flow = Math.sin(progress * Math.PI * 4) * 0.3 + 0.7;
        material.opacity = flow;
        
        requestAnimationFrame(animate);
      }
    };

    animate();
  };

  const createLiveParticles = (points: THREE.Vector3[], color: string, duration: number) => {
    if (!sceneRef.current) return;

    const particleCount = 5;
    const particles: THREE.Mesh[] = [];

    for (let i = 0; i < particleCount; i++) {
      const geometry = new THREE.SphereGeometry(0.1, 8, 8); // Much larger particles
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color)
      });

      const particle = new THREE.Mesh(geometry, material);
      sceneRef.current.add(particle); // Add individual particle, not the array
      particles.push(particle);
    }

    // Animate particles
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      if (progress < 1) {
        particles.forEach((particle, i) => {
          const offset = (i / particles.length) * Math.PI * 2;
          const particleProgress = (progress + offset / (Math.PI * 2)) % 1;
          
          const pointIndex = Math.floor(particleProgress * (points.length - 1));
          const point = points[pointIndex];
          
          if (point) {
            particle.position.copy(point);
            particle.scale.setScalar(1 + Math.sin(progress * Math.PI * 4 + offset) * 0.5);
          }
        });

        requestAnimationFrame(animate);
      } else {
        // Remove particles
        particles.forEach(particle => {
          if (sceneRef.current) {
            sceneRef.current.remove(particle);
          }
        });
      }
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
      {/* SVG World Map Background */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%', 
          height: '100%',
          zIndex: 1
        }}
      />
      
      {/* Three.js 3D Arcs Overlay */}
      <div
        ref={threeContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 2,
          pointerEvents: 'none'
        }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          color: '#222',
          backgroundColor: '#fff',
          padding: '0.5em',
          textShadow: '#f5f5f5 0 1px 0',
          borderRadius: '2px',
          opacity: 0.9,
          position: 'absolute',
          pointerEvents: 'none',
          fontSize: '13px',
          zIndex: 1000,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          display: 'none'
        }}
      />

      {/* Live Attack Counter */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        color: '#ffffff',
        padding: '10px 15px',
        borderRadius: '5px',
        fontSize: '14px',
        zIndex: 1000
      }}>
        Live Attacks: {activeAttacks.length}
      </div>
    </div>
  );
};

export default LiveThreatMap;
