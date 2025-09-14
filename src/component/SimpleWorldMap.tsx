'use client';

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import worldData from '../data/world.json';
import countryCoordinates from '../data/countryCoordinates.json';
import threatData from '../data/threatData.json';

// Type definitions
interface CountryFeature {
  id: string;
  properties: {
    name: string;
  };
}

interface CountryCoordinate {
  lat: number;
  lng: number;
  name: string;
}

interface ThreatAttack {
  id: string;
  source: string;
  target: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  duration: number;
  description: string;
}

interface ThreatData {
  attacks: ThreatAttack[];
  severityLevels: {
    [key: string]: {
      color: string;
      strokeWidth: number;
    };
  };
}

const SimpleWorldMap: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const width = 1100;
  const height = 750;

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
        // Only allow wheel events (zoom), block all drag events
        return event.type === 'wheel';
      })
      .on("zoom", (event) => {
        const { transform } = event;
        // Always zoom from center, ignore any translation
        const centerTransform = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(transform.k)
          .translate(-width / 2, -height / 2);
        
        // Transform the main group (contains both countries and arcs)
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
      .style("fill", "#cccccc") // All countries same gray color
      .style("stroke", "#999999")
      .style("stroke-width", "1px")
      .style("stroke-linejoin", "round")
      .attr("d", path as any)
      .on("mouseover", function(event, d) {
        const feature = d as CountryFeature;

        // Change border color on hover
        d3.select(this)
          .style("stroke", "#0f22f2")
          .style("stroke-width", "2px");
        //   .style("fill", "#aaaaaa");


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
          .style("stroke", "#999999")
          .style("stroke-width", "1px");

        // Reset all countries to original gray color
        countriesGroup.selectAll(".subunit")
          .style("fill", "#cccccc"); // Original gray color

        tooltip.style("display", "none");
      });

    // Add animated attack arcs inside main group
    addAnimatedAttackArcs(mainGroup, projection, tooltip, svgRef.current);

    // Add attack pointers (red glowing circles)
    addAttackPointers(mainGroup, projection);

    // Cleanup function
    return () => {
      // Clear all particle intervals
      svg.selectAll('.attack-arcs').each(function() {
        const intervalId = (this as any).__particleInterval;
        if (intervalId) {
          clearInterval(intervalId);
        }
      });

      // Clear all animations and particles
      svg.selectAll('.attack-particle').remove();
      svg.selectAll('.attack-arc').remove();
      svg.selectAll('.attack-pointer').remove();
    };
  }, []);

  // Function to create dramatic globe-style arc (like the images)
  const createDramaticGlobeArc = (source: [number, number], target: [number, number]) => {
    const dx = target[0] - source[0];
    const dy = target[1] - source[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate dramatic arc height based on distance
    const arcHeight = Math.min(distance * 0.6, 300); // More dramatic curve
    
    // Calculate multiple control points for smoother curve
    const midX = (source[0] + target[0]) / 2;
    const midY = (source[1] + target[1]) / 2 - arcHeight;
    
    // Create cubic bezier curve for smoother, more dramatic arc
    const cp1X = source[0] + (midX - source[0]) * 0.5;
    const cp1Y = source[1] - arcHeight * 0.3;
    const cp2X = target[0] - (target[0] - midX) * 0.5;
    const cp2Y = target[1] - arcHeight * 0.3;
    
    // Create dramatic curved arc
    return `M${source[0]},${source[1]}C${cp1X},${cp1Y} ${cp2X},${cp2Y} ${target[0]},${target[1]}`;
  };

  // Function to update arc path on projection change
  const updateArcPath = (arc: d3.Selection<SVGPathElement, unknown, null, undefined>, sourceId: string, targetId: string, projection: d3.GeoProjection) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const sourceCoord = coordinates[sourceId];
    const targetCoord = coordinates[targetId];

    if (sourceCoord && targetCoord) {
      const sourcePoint = projection([sourceCoord.lng, sourceCoord.lat]);
      const targetPoint = projection([targetCoord.lng, targetCoord.lat]);

      if (sourcePoint && targetPoint) {
        const newPath = createDramaticGlobeArc(sourcePoint, targetPoint);
        arc.attr("d", newPath);
      }
    }
  };

  // Function to add attack pointers (red glowing circles)
  const addAttackPointers = (mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>, projection: d3.GeoProjection) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const threats = threatData as ThreatData;

    // Create pointers group
    const pointersGroup = mainGroup.append("g")
      .attr("class", "attack-pointers");

    // Collect unique attack locations
    const attackLocations = new Set<string>();
    threats.attacks.forEach(attack => {
      attackLocations.add(attack.source);
      attackLocations.add(attack.target);
    });

    // Add pointers for each unique location
    attackLocations.forEach(countryId => {
      const coord = coordinates[countryId];
      if (coord) {
        const point = projection([coord.lng, coord.lat]);
        if (point) {
          // Create small outlined red circle
          const pointer = pointersGroup
            .append("circle")
            .attr("class", `attack-pointer ${countryId}`)
            .attr("cx", point[0])
            .attr("cy", point[1])
            .attr("r", 4)
            .style("fill", "none")
            .style("stroke", "#ff0000")
            .style("stroke-width", "2px")
            .style("opacity", 0.9)
            .style("filter", "drop-shadow(0 0 4px #ff0000)")
            .style("pointer-events", "none");

          // Add subtle pulsing animation
          const animatePulse = () => {
            pointer
              .transition()
              .duration(2000)
              .attr("r", 6)
              .style("opacity", 0.6)
              .transition()
              .duration(2000)
              .attr("r", 4)
              .style("opacity", 0.9)
              .on("end", animatePulse);
          };

          animatePulse();
        }
      }
    });
  };

  // Function to add animated attack arcs
  const addAnimatedAttackArcs = (mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>, projection: d3.GeoProjection, tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined>, svgElement: SVGSVGElement) => {
    const coordinates = countryCoordinates as { [key: string]: CountryCoordinate };
    const threats = threatData as ThreatData;

    // Create arcs group
    const arcsGroup = mainGroup.append("g")
      .attr("class", "attack-arcs");

    // Add animated arcs for each attack
    threats.attacks.forEach((attack, index) => {
      const sourceCoord = coordinates[attack.source];
      const targetCoord = coordinates[attack.target];

      if (sourceCoord && targetCoord) {
        const sourcePoint = projection([sourceCoord.lng, sourceCoord.lat]);
        const targetPoint = projection([targetCoord.lng, targetCoord.lat]);

        if (sourcePoint && targetPoint) {
          const severity = threats.severityLevels[attack.severity];

          // Create animated dramatic globe-style arc
          const arcPath = arcsGroup
            .append("path")
            .attr("class", `attack-arc attack-${attack.severity}`)
            .attr("d", createDramaticGlobeArc(sourcePoint, targetPoint))
            .style("fill", "none")
            .style("stroke", severity.color)
            .style("stroke-width", severity.strokeWidth)
            .style("opacity", 0.9)
            .style("filter", `drop-shadow(0 0 6px ${severity.color})`)
            .style("stroke-linecap", "round")
            .attr("data-attack-id", attack.id)
            .attr("data-source", attack.source)
            .attr("data-target", attack.target)
            .attr("data-type", attack.type)
            .attr("data-description", attack.description);

          // Add flowing arc animation (stroke-dasharray effect)
          const pathElement = arcPath.node() as SVGPathElement;
          if (pathElement) {
            const pathLength = pathElement.getTotalLength();
            
            // Set up flowing arc animation
            const dashLength = 15;
            const gapLength = 8;
            
            // Set initial dash pattern
            pathElement.style.strokeDasharray = `${dashLength},${gapLength}`;
            pathElement.style.strokeDashoffset = `${pathLength + dashLength}`;
            
            // Animate the arc flow
            const animateArc = () => {
              pathElement.style.transition = `stroke-dashoffset 3000ms linear`;
              pathElement.style.strokeDashoffset = `${-pathLength - dashLength}`;
              
              // Restart animation after completion
              setTimeout(() => {
                pathElement.style.strokeDashoffset = `${pathLength + dashLength}`;
                setTimeout(animateArc, 500);
              }, 3000);
            };
            
            // Start arc animation with delay
            setTimeout(animateArc, index * 400);
            
            // Create subtle particle stream (arc is main animation)
            const createParticleStream = () => {
              let particleId = 0;
              const streamInterval = 1500; // Slower particle stream since arc is animated
              
              const spawnParticle = () => {
                const particle = arcsGroup
                  .append("circle")
                  .attr("class", `attack-particle ${attack.id}-${particleId}`)
                  .attr("cx", sourcePoint[0])
                  .attr("cy", sourcePoint[1])
                  .attr("r", 2)
                  .style("fill", severity.color)
                  .style("opacity", 0.7)
                  .style("filter", `drop-shadow(0 0 4px ${severity.color})`)
                  .style("pointer-events", "none");

                // Animate this particle along the arc
                const animateParticle = () => {
                  const startTime = Date.now();
                  const duration = 2500; // Fixed duration for consistent flow
                  
                  const animate = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    if (progress < 1) {
                      // Easing function for smooth movement
                      const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
                      
                      // Calculate position along the dramatic cubic bezier curve
                      const dx = targetPoint[0] - sourcePoint[0];
                      const dy = targetPoint[1] - sourcePoint[1];
                      const distance = Math.sqrt(dx * dx + dy * dy);
                      const arcHeight = Math.min(distance * 0.6, 300);
                      
                      // Calculate control points for cubic bezier
                      const midX = (sourcePoint[0] + targetPoint[0]) / 2;
                      const cp1X = sourcePoint[0] + (midX - sourcePoint[0]) * 0.5;
                      const cp1Y = sourcePoint[1] - arcHeight * 0.3;
                      const cp2X = targetPoint[0] - (targetPoint[0] - midX) * 0.5;
                      const cp2Y = targetPoint[1] - arcHeight * 0.3;
                      
                      // Cubic bezier interpolation
                      const t = easeProgress;
                      const x = Math.pow(1 - t, 3) * sourcePoint[0] + 
                               3 * Math.pow(1 - t, 2) * t * cp1X + 
                               3 * (1 - t) * Math.pow(t, 2) * cp2X + 
                               Math.pow(t, 3) * targetPoint[0];
                      const y = Math.pow(1 - t, 3) * sourcePoint[1] + 
                               3 * Math.pow(1 - t, 2) * t * cp1Y + 
                               3 * (1 - t) * Math.pow(t, 2) * cp2Y + 
                               Math.pow(t, 3) * targetPoint[1];
                      
                      // Update particle position (subtle since arc is main animation)
                      particle
                        .attr("cx", x)
                        .attr("cy", y)
                        .style("opacity", 0.7 - progress * 0.3) // Fade out as it travels
                        .style("r", 2 + Math.sin(progress * Math.PI) * 0.5); // Subtle pulse
                      
                      requestAnimationFrame(animate);
                    } else {
                      // Particle reached target - remove it
                      particle.remove();
                    }
                  };
                  
                  animate();
                };
                
                // Start this particle's animation
                animateParticle();
                particleId++;
              };
              
              // Start spawning particles
              spawnParticle(); // First particle
              
              // Continue spawning particles at intervals
              const intervalId = setInterval(spawnParticle, streamInterval);
              
              // Store interval ID for cleanup
              (arcsGroup.node() as any).__particleInterval = intervalId;
            };
            
            // Start the particle stream with delay
            setTimeout(createParticleStream, index * 300);
          }

                 // Hover effects
                 arcPath
                   .on("mouseover", function(event) {
                     d3.select(this)
                       .style("opacity", 1)
                       .style("stroke-width", severity.strokeWidth * 1.5);

                     const [mouseX, mouseY] = d3.pointer(event, svgElement);

              tooltip
                .style("display", "block")
                .style("left", `${mouseX + 10}px`)
                .style("top", `${mouseY - 40}px`)
                .html(`
                  <div style="font-weight: bold; color: ${severity.color};">${attack.type}</div>
                  <div style="margin: 3px 0;">From: <strong>${sourceCoord.name}</strong></div>
                  <div style="margin: 3px 0;">To: <strong>${targetCoord.name}</strong></div>
                  <div style="margin: 3px 0;">Severity: <span style="color: ${severity.color};">${attack.severity.toUpperCase()}</span></div>
                  <div style="margin-top: 8px; font-size: 11px; line-height: 1.3;">${attack.description}</div>
                `);
            })
            .on("mouseout", function() {
              d3.select(this)
                .style("opacity", 0.8)
                .style("stroke-width", severity.strokeWidth);

              tooltip.style("display", "none");
            });
        }
      }
    });
  };

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
    </div>
  );
};

export default SimpleWorldMap;
