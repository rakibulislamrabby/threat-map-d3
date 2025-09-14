'use client';

import React, { useEffect, useRef, useState } from 'react';
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

const D3AnimatedArcs: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [activeAttacks, setActiveAttacks] = useState<any[]>([]);

  const width = 1600;
  const height = 1000;

  useEffect(() => {
    if (!svgRef.current || !tooltipRef.current) return;

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
      .style("fill", "#f5f5f5") // Light gray for countries
      .style("stroke", "#d0d0d0")
      .style("stroke-width", "1px")
      .style("stroke-linejoin", "round")
      .attr("d", path as any)
      .on("mouseover", function(event, d) {
        const feature = d as CountryFeature;

        // Change border color on hover
        d3.select(this)
          .style("stroke", "#3498db")
          .style("stroke-width", "2px");

        // Make all countries slightly darker when hovering
        countriesGroup.selectAll(".subunit")
          .style("fill", "#e8e8e8"); // Slightly darker gray

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
          .style("stroke", "#d0d0d0")
          .style("stroke-width", "1px");

        // Reset all countries to original light color
        countriesGroup.selectAll(".subunit")
          .style("fill", "#f5f5f5"); // Original light gray color

        tooltip.style("display", "none");
      });

    // Create animated attack arcs
    createAnimatedAttackArcs(mainGroup, projection, tooltip);

    // Cleanup function
    return () => {
      // Clear all animations and particles
      svg.selectAll('.attack-particle').remove();
      svg.selectAll('.attack-arc').remove();
    };
  }, []);

  // Function to create curved arc path between two points
  const createCurvedArcPath = (source: [number, number], target: [number, number]) => {
    const dx = target[0] - source[0];
    const dy = target[1] - source[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate arc height based on distance
    const arcHeight = Math.min(distance * 0.4, 200);

    // Calculate control point for quadratic bezier curve
    const midX = (source[0] + target[0]) / 2;
    const midY = (source[1] + target[1]) / 2 - arcHeight;

    // Create curved arc using quadratic bezier
    return `M${source[0]},${source[1]}Q${midX},${midY} ${target[0]},${target[1]}`;
  };

  // Function to get point along arc path at given progress (0-1)
  const getPointAlongArc = (source: [number, number], target: [number, number], progress: number) => {
    const dx = target[0] - source[0];
    const dy = target[1] - source[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    const arcHeight = Math.min(distance * 0.4, 200);

    const midX = (source[0] + target[0]) / 2;
    const midY = (source[1] + target[1]) / 2 - arcHeight;

    // Quadratic bezier interpolation
    const t = progress;
    const x = Math.pow(1 - t, 2) * source[0] + 2 * (1 - t) * t * midX + Math.pow(t, 2) * target[0];
    const y = Math.pow(1 - t, 2) * source[1] + 2 * (1 - t) * t * midY + Math.pow(t, 2) * target[1];
    
    return [x, y] as [number, number];
  };

  // Function to create animated attack arcs
  const createAnimatedAttackArcs = (
    mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>, 
    projection: d3.GeoProjection, 
    tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined>
  ) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const threats = threatData as ThreatData;

    // Create arcs group
    const arcsGroup = mainGroup.append("g")
      .attr("class", "attack-arcs");

    // Create gradient definitions for professional arc styling
    const defs = svgRef.current?.querySelector('defs') || 
      svgRef.current?.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), svgRef.current.firstChild);
    
    // Create gradients for different severity levels
    const createGradient = (id: string, color1: string, color2: string) => {
      const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      gradient.setAttribute('id', id);
      gradient.setAttribute('x1', '0%');
      gradient.setAttribute('y1', '0%');
      gradient.setAttribute('x2', '100%');
      gradient.setAttribute('y2', '0%');
      
      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('stop-color', color1);
      stop1.setAttribute('stop-opacity', '0.9');
      
      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.setAttribute('stop-color', color2);
      stop2.setAttribute('stop-opacity', '0.5');
      
      gradient.appendChild(stop1);
      gradient.appendChild(stop2);
      defs?.appendChild(gradient);
    };

    // Create professional gradients for each severity
    createGradient('critical-gradient', '#ff0000', '#ff6666');
    createGradient('high-gradient', '#ff6600', '#ff9933');
    createGradient('medium-gradient', '#ffaa00', '#ffcc66');
    createGradient('low-gradient', '#00aa00', '#66cc66');

    // Add animated arcs for each attack
    threats.attacks.forEach((attack, index) => {
      const sourceCoord = coordinates[attack.source];
      const targetCoord = coordinates[attack.target];

      if (sourceCoord && targetCoord) {
        const sourcePoint = projection([sourceCoord.lng, sourceCoord.lat]);
        const targetPoint = projection([targetCoord.lng, targetCoord.lat]);

        if (sourcePoint && targetPoint) {
          const severity = threats.severityLevels[attack.severity];

          // Create animated curved arc (globe.gl style)
          const arcPath = arcsGroup
            .append("path")
            .attr("class", `attack-arc attack-${attack.severity}`)
            .attr("d", createCurvedArcPath(sourcePoint, targetPoint))
            .style("fill", "none")
            .style("stroke", severity.color) // Use solid color like globe.gl
            .style("stroke-width", 0.5) // Thin lines like globe.gl
            .style("opacity", 0.8)
            .style("filter", `drop-shadow(0 0 3px ${severity.color})`) // Subtle glow
            .style("stroke-linecap", "round")
            .style("stroke-linejoin", "round")
            .attr("data-attack-id", attack.id)
            .attr("data-source", attack.source)
            .attr("data-target", attack.target)
            .attr("data-type", attack.type)
            .attr("data-description", attack.description);

          // Add flowing arc animation (like globe.gl style)
          const pathElement = arcPath.node() as SVGPathElement;
          if (pathElement) {
            const pathLength = pathElement.getTotalLength();

            // Globe.gl style dash animation - continuous flowing
            const dashLength = 0.5; // Short dashes like globe.gl
            const gapLength = 0.1;  // Small gaps like globe.gl
            const animateTime = 1500; // 1.5 seconds like globe.gl

            // Set initial dash pattern
            pathElement.style.strokeDasharray = `${dashLength},${gapLength}`;
            pathElement.style.strokeDashoffset = `${pathLength + dashLength}`;

            // Continuous flowing animation (like globe.gl)
            const animateArc = () => {
              pathElement.style.transition = `stroke-dashoffset ${animateTime}ms linear`;
              pathElement.style.strokeDashoffset = `${-pathLength - dashLength}`;

              // Restart animation immediately for continuous flow
              setTimeout(() => {
                pathElement.style.strokeDashoffset = `${pathLength + dashLength}`;
                animateArc(); // Immediate restart for continuous flow
              }, animateTime);
            };

            // Start arc animation with staggered delay
            setTimeout(animateArc, index * 200);
          }

          // Create particle animation along the arc (globe.gl style)
          const createParticleAnimation = () => {
            let particleId = 0;
            const particleInterval = 800; // Faster spawning like globe.gl

            const spawnParticle = () => {
              const particle = arcsGroup
                .append("circle")
                .attr("class", `attack-particle ${attack.id}-${particleId}`)
                .attr("cx", sourcePoint[0])
                .attr("cy", sourcePoint[1])
                .attr("r", 2) // Smaller particles like globe.gl
                .style("fill", severity.color)
                .style("opacity", 0.8)
                .style("filter", `drop-shadow(0 0 4px ${severity.color})`)
                .style("pointer-events", "none");

              // Animate particle along the arc (faster like globe.gl)
              const startTime = Date.now();
              const duration = 2000; // Faster travel time like globe.gl

              const animateParticle = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                if (progress < 1) {
                  // Linear movement like globe.gl (no easing)
                  const position = getPointAlongArc(sourcePoint, targetPoint, progress);
                  
                  // Update particle position
                  particle
                    .attr("cx", position[0])
                    .attr("cy", position[1])
                    .style("opacity", 0.8 - progress * 0.3) // Subtle fade
                    .style("r", 2 + Math.sin(progress * Math.PI * 2) * 0.5); // Subtle pulse

                  requestAnimationFrame(animateParticle);
                } else {
                  // Particle reached target - remove it
                  particle.remove();
                }
              };

              // Start this particle's animation
              animateParticle();
              particleId++;
            };

            // Start spawning particles
            spawnParticle(); // First particle

            // Continue spawning particles at intervals
            const intervalId = setInterval(spawnParticle, particleInterval);

            // Store interval ID for cleanup
            (arcsGroup.node() as any).__particleInterval = intervalId;
          };

          // Start the particle animation with delay
          setTimeout(createParticleAnimation, index * 300);

          // Hover effects (globe.gl style)
          arcPath
            .on("mouseover", function(event) {
              d3.select(this)
                .style("opacity", 1)
                .style("stroke-width", 1.5); // Slightly thicker on hover

              const [mouseX, mouseY] = d3.pointer(event, svgRef.current);

              tooltip
                .style("display", "block")
                .style("left", `${mouseX + 15}px`)
                .style("top", `${mouseY - 50}px`)
                .style("background", "rgba(255, 255, 255, 0.95)")
                .style("color", "#2c3e50")
                .style("border", `2px solid ${severity.color}`)
                .style("border-radius", "12px")
                .style("padding", "12px")
                .style("font-size", "13px")
                .style("box-shadow", `0 4px 20px rgba(52, 152, 219, 0.2), 0 0 20px ${severity.color}40`)
                .html(`
                  <div style="font-weight: bold; color: ${severity.color}; font-size: 14px; margin-bottom: 8px;">${attack.type}</div>
                  <div style="margin: 4px 0; color: #7f8c8d;">From: <strong style="color: #2c3e50;">${sourceCoord.name}</strong></div>
                  <div style="margin: 4px 0; color: #7f8c8d;">To: <strong style="color: #2c3e50;">${targetCoord.name}</strong></div>
                  <div style="margin: 4px 0; color: #7f8c8d;">Severity: <span style="color: ${severity.color}; font-weight: bold;">${attack.severity.toUpperCase()}</span></div>
                  <div style="margin-top: 10px; font-size: 12px; line-height: 1.4; color: #95a5a6; border-top: 1px solid #bdc3c7; padding-top: 8px;">${attack.description}</div>
                `);
            })
            .on("mouseout", function() {
              d3.select(this)
                .style("opacity", 0.8)
                .style("stroke-width", 0.5); // Back to thin lines

              tooltip.style("display", "none");
            });
        }
      }
    });
  };

  // Live attack simulation
  useEffect(() => {
    const simulateLiveAttacks = () => {
      // Generate random attacks based on threat data
      const newAttacks = threatData.attacks.slice(0, Math.floor(Math.random() * 5) + 1).map(attack => ({
        ...attack,
        id: `${attack.id}-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString()
      }));
      
      setActiveAttacks(prev => {
        // Keep only recent attacks (last 30 seconds)
        const now = Date.now();
        const recent = prev.filter(attack => 
          now - new Date(attack.timestamp).getTime() < 30000
        );
        return [...recent, ...newAttacks];
      });
    };

    // Start simulation
    const interval = setInterval(simulateLiveAttacks, 2000); // New attacks every 2 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      position: 'relative',
      overflow: 'hidden',
      background: '#ffffff'
    }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* Live attack counter */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        background: 'rgba(255, 255, 255, 0.95)',
        color: '#2c3e50',
        padding: '10px 15px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 'bold',
        border: '2px solid #666666',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)'
      }}>
        Live Attacks: {activeAttacks.length}
      </div>

      <div
        ref={tooltipRef}
        style={{
          color: '#2c3e50',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          padding: '12px',
          borderRadius: '12px',
          opacity: 0.95,
          position: 'absolute',
          pointerEvents: 'none',
          fontSize: '13px',
          zIndex: 1000,
          boxShadow: '0 4px 20px rgba(52, 152, 219, 0.2)',
          border: '1px solid #bdc3c7',
          backdropFilter: 'blur(10px)',
          display: 'none'
        }}
      />
    </div>
  );
};

export default D3AnimatedArcs;
